use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IfcImportResult {
    pub windows: Vec<ImportedWindow>,
    pub doors: Vec<ImportedDoor>,
    pub openings: Vec<ImportedOpening>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedWindow {
    pub guid: String,
    pub name: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDoor {
    pub guid: String,
    pub name: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedOpening {
    pub guid: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub wall_guid: Option<String>,
}

/// Extract explicit window/door dimensions; this is not a geometry importer.
/// Attribute positions and project units follow the buildingSMART IFC schema.
pub fn parse_ifc_file(filepath: &str) -> Result<IfcImportResult, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(filepath)
        .map_err(|e| format!("Cannot open IFC file: {e}"))?
        .take(MAX_IFC_BYTES as u64 + 1).read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read IFC file: {e}"))?;
    if bytes.len() > MAX_IFC_BYTES { return Err("IFC import is limited to 64 MB.".into()); }
    let content = std::str::from_utf8(&bytes)
        .map_err(|_| "IFC input must be UTF-8 or use STEP string escapes.".to_string())?;
    parse_ifc_text(content)
}

const MAX_IFC_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug)]
struct Entity { kind: String, args: Vec<String> }

/// Shared by the Windows and WebAssembly builds. Missing dimensions are never
/// guessed: representation-derived sizing is explicitly outside this importer.
pub fn parse_ifc_text(content: &str) -> Result<IfcImportResult, String> {
    if content.len() > MAX_IFC_BYTES { return Err("IFC import is limited to 64 MB.".into()); }
    let statements = statements(content)?;
    if statements.first().map(String::as_str) != Some("ISO-10303-21")
        || statements.last().map(String::as_str) != Some("END-ISO-10303-21") {
        return Err("The file is not a complete IFC STEP document.".into());
    }
    let schema = statements.iter().find(|s| s.starts_with("FILE_SCHEMA("))
        .ok_or("IFC FILE_SCHEMA is missing.")?;
    let schema_name = step_string(schema.trim_start_matches("FILE_SCHEMA((").trim_end_matches("))").trim())?;
    if !matches!(schema_name.as_str(), "IFC2X3" | "IFC4" | "IFC4X1" | "IFC4X2" | "IFC4X3" | "IFC4X3_ADD1" | "IFC4X3_ADD2") {
        return Err(format!("Unsupported IFC schema: {schema_name}"));
    }
    let mut entities = HashMap::new();
    let mut order = Vec::new();
    let mut in_data = false;
    let mut seen_data = false;
    for statement in &statements {
        if statement == "DATA" {
            if seen_data { return Err("Multiple IFC DATA sections are not supported.".into()); }
            in_data = true; seen_data = true; continue;
        }
        if statement == "ENDSEC" { in_data = false; continue; }
        if !in_data { continue; }
        let (id, entity) = entity(statement)?;
        if entities.insert(id, entity).is_some() { return Err(format!("Duplicate IFC entity #{id}.")); }
        order.push(id);
        if order.len() > 200_000 { return Err("IFC dimension import is limited to 200,000 entities.".into()); }
    }
    if !seen_data { return Err("IFC DATA section is missing.".into()); }
    let projects: Vec<_> = entities.values().filter(|e| e.kind == "IFCPROJECT").collect();
    if projects.len() != 1 { return Err("IFC import requires exactly one project with explicit length units.".into()); }
    let assignment = reference(arg(projects[0], 8)?)?;
    let units = lookup(&entities, assignment)?;
    if units.kind != "IFCUNITASSIGNMENT" { return Err("Project UnitsInContext is not an IfcUnitAssignment.".into()); }
    let unit_list = arg(units, 0)?.strip_prefix('(').and_then(|s| s.strip_suffix(')'))
        .ok_or("Invalid IFC unit assignment.")?;
    let mut length_units = Vec::new();
    for unit in arguments(unit_list)? {
        let id = reference(&unit)?;
        let unit_entity = lookup(&entities, id)?;
        if unit_entity.args.get(1).map(String::as_str) == Some(".LENGTHUNIT.") { length_units.push(id); }
    }
    if length_units.len() != 1 { return Err("Project must declare exactly one length unit; dimensions were not assumed.".into()); }
    let factor = length_factor_mm(&entities, length_units[0], 0)?;
    let mut frame_guids = std::collections::HashSet::new();
    let mut result = IfcImportResult { windows: vec![], doors: vec![], openings: vec![] };
    for id in order {
        let e = lookup(&entities, id)?;
        match e.kind.as_str() {
            "IFCWINDOW" | "IFCWINDOWSTANDARDCASE" | "IFCDOOR" | "IFCDOORSTANDARDCASE" => {
                let guid = step_string(arg(e, 0)?)?;
                if guid.is_empty() { return Err(format!("IFC entity #{id} has no GlobalId.")); }
                if !frame_guids.insert(guid.clone()) { return Err(format!("Duplicate IFC frame GlobalId {guid}.")); }
                let name = if arg(e, 2)? == "$" { "Unnamed frame".into() } else { step_string(arg(e, 2)?)? };
                let height_mm = dimension(arg(e, 8)?, factor, id, "OverallHeight")?;
                let width_mm = dimension(arg(e, 9)?, factor, id, "OverallWidth")?;
                let mut properties = HashMap::new();
                if arg(e, 7)? != "$" { properties.insert("Tag".into(), step_string(arg(e, 7)?)?); }
                if e.kind.starts_with("IFCWINDOW") {
                    result.windows.push(ImportedWindow { guid, name, width_mm, height_mm, properties });
                } else { result.doors.push(ImportedDoor { guid, name, width_mm, height_mm, properties }); }
            }
            "IFCOPENINGELEMENT" => {
                // Only identity is extracted; zero denotes unknown dimensions,
                // not a calculated opening size. No geometry is reconstructed.
                result.openings.push(ImportedOpening { guid: step_string(arg(e, 0)?)?, width_mm: 0.0, height_mm: 0.0, wall_guid: None });
            }
            _ => {}
        }
    }
    if result.windows.is_empty() && result.doors.is_empty() && result.openings.is_empty() {
        return Err("No supported windows, doors or opening identities were found.".into());
    }
    Ok(result)
}

fn arg(e: &Entity, index: usize) -> Result<&str, String> {
    e.args.get(index).map(String::as_str).ok_or_else(|| format!("{} has missing attributes.", e.kind))
}
fn reference(value: &str) -> Result<u64, String> {
    value.trim().strip_prefix('#').and_then(|s| s.parse::<u64>().ok()).filter(|id| *id > 0)
        .ok_or_else(|| format!("Invalid or missing IFC reference: {value}"))
}
fn lookup(entities: &HashMap<u64, Entity>, id: u64) -> Result<&Entity, String> {
    entities.get(&id).ok_or_else(|| format!("Missing IFC entity #{id}."))
}
fn dimension(value: &str, factor: f64, id: u64, name: &str) -> Result<f64, String> {
    let number = value.parse::<f64>().map_err(|_| format!("Entity #{id} needs explicit {name}; geometry-derived dimensions are not supported."))?;
    let mm = number * factor;
    if !mm.is_finite() || mm <= 0.0 { return Err(format!("Entity #{id} {name} must be a finite positive length.")); }
    Ok(mm)
}

fn length_factor_mm(entities: &HashMap<u64, Entity>, id: u64, depth: u8) -> Result<f64, String> {
    if depth > 8 { return Err("Cyclic or excessively nested IFC unit conversion.".into()); }
    let e = lookup(entities, id)?;
    if arg(e, 1)? != ".LENGTHUNIT." { return Err("IFC conversion must reference a length unit.".into()); }
    let result = match e.kind.as_str() {
        "IFCSIUNIT" => {
            if arg(e, 3)? != ".METRE." { return Err("Unsupported IFC SI length unit.".into()); }
            let prefix = match arg(e, 2)? {
                "$" => 1.0, ".EXA." => 1e18, ".PETA." => 1e15, ".TERA." => 1e12,
                ".GIGA." => 1e9, ".MEGA." => 1e6, ".KILO." => 1e3, ".HECTO." => 1e2,
                ".DECA." => 1e1, ".DECI." => 1e-1, ".CENTI." => 1e-2, ".MILLI." => 1e-3,
                ".MICRO." => 1e-6, ".NANO." => 1e-9, ".PICO." => 1e-12, ".FEMTO." => 1e-15,
                ".ATTO." => 1e-18, _ => return Err("Unsupported IFC SI prefix.".into()),
            };
            1000.0 * prefix
        }
        "IFCCONVERSIONBASEDUNIT" => {
            let measure = lookup(entities, reference(arg(e, 3)?)?)?;
            if measure.kind != "IFCMEASUREWITHUNIT" { return Err("Invalid IFC conversion factor.".into()); }
            let raw = arg(measure, 0)?;
            let scalar = ["IFCLENGTHMEASURE(", "IFCPOSITIVELENGTHMEASURE("].iter()
                .find_map(|prefix| raw.strip_prefix(prefix).and_then(|s| s.strip_suffix(')')))
                .and_then(|s| s.parse::<f64>().ok()).ok_or("Invalid IFC length conversion measure.")?;
            if !scalar.is_finite() || scalar <= 0.0 { return Err("IFC length conversion factor must be finite and positive.".into()); }
            scalar * length_factor_mm(entities, reference(arg(measure, 1)?)?, depth + 1)?
        }
        _ => return Err(format!("Unsupported IFC length-unit type: {}", e.kind)),
    };
    if !result.is_finite() || result <= 0.0 { return Err("Invalid IFC length conversion.".into()); }
    Ok(result)
}

fn statements(content: &str) -> Result<Vec<String>, String> {
    let mut input = content.trim_start_matches('\u{feff}').chars().peekable();
    let mut output = Vec::new();
    let mut buffer = String::new();
    let mut quoted = false;
    while let Some(ch) = input.next() {
        if ch == '\'' {
            buffer.push(ch);
            if quoted && input.peek() == Some(&'\'') { buffer.push(input.next().unwrap()); }
            else { quoted = !quoted; }
        } else if !quoted && ch == '/' && input.peek() == Some(&'*') {
            input.next();
            let mut closed = false;
            while let Some(c) = input.next() {
                if c == '*' && input.peek() == Some(&'/') { input.next(); closed = true; break; }
            }
            if !closed { return Err("Unterminated IFC comment.".into()); }
            buffer.push(' ');
        } else if !quoted && ch == ';' {
            output.push(buffer.trim().to_string()); buffer.clear();
        } else { buffer.push(ch); }
    }
    if quoted || !buffer.trim().is_empty() { return Err("Unterminated IFC statement or string.".into()); }
    Ok(output)
}

fn arguments(content: &str) -> Result<Vec<String>, String> {
    let mut input = content.char_indices().peekable();
    let mut quoted = false;
    let mut depth = 0usize;
    let mut start = 0;
    let mut result = Vec::new();
    while let Some((index, ch)) = input.next() {
        if ch == '\'' {
            if quoted && input.peek().map(|(_, c)| *c) == Some('\'') { input.next(); }
            else { quoted = !quoted; }
        } else if !quoted {
            match ch {
                '(' => depth += 1,
                ')' => depth = depth.checked_sub(1).ok_or("Unbalanced IFC arguments.")?,
                ',' if depth == 0 => { result.push(content[start..index].trim().to_string()); start = index + 1; }
                _ => {}
            }
        }
    }
    if quoted || depth != 0 { return Err("Unbalanced IFC arguments or string.".into()); }
    result.push(content[start..].trim().to_string());
    Ok(result)
}

fn entity(statement: &str) -> Result<(u64, Entity), String> {
    let (id, body) = statement.split_once('=').ok_or("Invalid IFC entity statement.")?;
    let id = reference(id)?;
    let (kind, args) = body.trim().split_once('(').ok_or("Invalid IFC entity arguments.")?;
    let kind = kind.trim().to_ascii_uppercase();
    if kind.is_empty() || !kind.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') { return Err("Unsupported IFC complex entity.".into()); }
    let args = args.trim().strip_suffix(')').ok_or("Unterminated IFC entity.")?;
    Ok((id, Entity { kind, args: arguments(args)? }))
}

fn step_string(value: &str) -> Result<String, String> {
    let raw = value.strip_prefix('\'').and_then(|s| s.strip_suffix('\''))
        .ok_or_else(|| format!("Invalid IFC string: {value}"))?;
    let raw = raw.replace("''", "'");
    let mut remaining = raw.as_str();
    let mut output = String::new();
    while !remaining.is_empty() {
        if remaining.starts_with("\\X2\\") || remaining.starts_with("\\X4\\") {
            let utf16 = remaining.starts_with("\\X2\\");
            let end = remaining[4..].find("\\X0\\").ok_or("Unterminated IFC Unicode escape.")? + 4;
            let hex = &remaining[4..end];
            let digits = if utf16 { 4 } else { 8 };
            if hex.is_empty() || hex.len() % digits != 0 || !hex.is_ascii() { return Err("Invalid IFC Unicode escape.".into()); }
            if utf16 {
                let units: Result<Vec<_>, _> = (0..hex.len()).step_by(4).map(|i| u16::from_str_radix(&hex[i..i+4], 16)).collect();
                output.push_str(&String::from_utf16(&units.map_err(|_| "Invalid IFC Unicode escape.")?).map_err(|_| "Invalid IFC Unicode sequence.")?);
            } else {
                for i in (0..hex.len()).step_by(8) {
                    let cp = u32::from_str_radix(&hex[i..i+8], 16).map_err(|_| "Invalid IFC Unicode escape.")?;
                    output.push(char::from_u32(cp).ok_or("Invalid IFC Unicode code point.")?);
                }
            }
            remaining = &remaining[end+4..];
        } else if remaining.starts_with("\\\\") {
            output.push('\\'); remaining = &remaining[2..];
        } else if remaining.starts_with('\\') {
            return Err("Unsupported legacy IFC string escape; use UTF-8 or X2/X4 Unicode escapes.".into());
        } else {
            let ch = remaining.chars().next().unwrap(); output.push(ch); remaining = &remaining[ch.len_utf8()..];
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(unit: &str, elements: &str) -> String {
        format!("ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;\n#1=IFCPROJECT('project',$,'Project',$,$,$,$,$,#2);\n#2=IFCUNITASSIGNMENT((#3));\n{unit}\n{elements}\nENDSEC;END-ISO-10303-21;")
    }
    fn window(height: &str, width: &str) -> String {
        format!("#10=IFCWINDOW('window-guid',$,'Correct name','Description',$,$,$,'W01',{height},{width},.WINDOW.,.SINGLE_PANEL.,$);")
    }
    fn assert_size(content: &str, width: f64, height: f64) {
        let r = parse_ifc_text(content).unwrap();
        assert_eq!(r.windows.len(), 1);
        assert!((r.windows[0].width_mm - width).abs() < 1e-8);
        assert!((r.windows[0].height_mm - height).abs() < 1e-8);
        assert_eq!(r.windows[0].name, "Correct name");
        assert_eq!(r.windows[0].properties["Tag"], "W01");
    }
    #[test]
    fn si_units_use_project_context_and_exact_attributes() {
        for (prefix, height, width) in [("$", "1.4", "0.9"), (".MILLI.", "1400.", "900."), (".CENTI.", "140.", "90.")] {
            assert_size(&file(&format!("#3=IFCSIUNIT(*,.LENGTHUNIT.,{prefix},.METRE.);"), &window(height,width)), 900.,1400.);
        }
    }
    #[test]
    fn conversion_units_follow_measure_and_base_unit_not_name() {
        for (factor,height,width,w,h) in [("0.3048","7.","3.",914.4,2133.6),("0.0254","80.","36.",914.4,2032.)] {
            let unit = format!("#3=IFCCONVERSIONBASEDUNIT(#6,.LENGTHUNIT.,'custom name',#4);#4=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE({factor}),#5);#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);#6=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);");
            assert_size(&file(&unit,&window(height,width)),w,h);
        }
    }
    #[test]
    fn packed_multiline_entities_comments_strings_and_unicode() {
        let text = file("#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "/* IFCWINDOW('fake'); */\n#10=IFCWINDOW(\n'window-guid',$,'O''Brien, \\X2\\00E900DF\\X0\\; \\X4\\0001F600\\X0\\','IFCDOOR(fake)',$,$,$,$,1400.,900.,.WINDOW.,.SINGLE_PANEL.,$); #11=IFCDOOR('door',$,'Door',$,$,$,$,$,2100.,1000.,.DOOR.,.SINGLE_SWING_LEFT.,$);");
        let r = parse_ifc_text(&text).unwrap();
        assert_eq!(r.windows.len(),1); assert_eq!(r.doors.len(),1);
        assert_eq!(r.windows[0].name,"O'Brien, éß; 😀");
        assert_eq!(r.doors[0].width_mm,1000.); assert_eq!(r.doors[0].height_mm,2100.);
    }
    #[test]
    fn missing_invalid_and_overflowing_dimensions_never_become_defaults() {
        for height in ["$", "*", "0.", "-1.", "NaN", "Infinity", "1e309", "#20"] {
            assert!(parse_ifc_text(&file("#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", &window(height,"0.9"))).is_err(),"{height}");
        }
        let text = file("#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", &window("$","$"));
        // Unrelated trailing numeric attributes must not masquerade as dimensions.
        assert!(parse_ifc_text(&text.replace(".WINDOW.,.SINGLE_PANEL.","2.,3.")).is_err());
        assert!(parse_ifc_text(&file("#3=IFCSIUNIT(*,.LENGTHUNIT.,.EXA.,.METRE.);",&window("1e300","0.9"))).is_err());
    }
    #[test]
    fn missing_ambiguous_or_cyclic_units_are_rejected() {
        let text = file("#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", &window("1.4","0.9"));
        for bad in [text.replace("$,#2);","$,$);"),text.replace("(#3)","(#3,#3)"),text.replace(".LENGTHUNIT.",".AREAUNIT."),text.replace("#2=IFCUNITASSIGNMENT","#2=IFCUNKNOWN")] {
            assert!(parse_ifc_text(&bad).is_err());
        }
        let unit = "#3=IFCCONVERSIONBASEDUNIT(#6,.LENGTHUNIT.,'cyclic',#4);#4=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(1.),#3);#6=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);";
        assert!(parse_ifc_text(&file(unit,&window("1.4","0.9"))).unwrap_err().contains("Cyclic"));
    }
    #[test]
    fn malformed_document_and_duplicate_entities_are_rejected() {
        let valid = file("#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", &window("1.4","0.9"));
        for bad in ["not IFC".to_string(),valid.replace("IFC4","UNKNOWN"),valid.replace("END-ISO-10303-21;",""),valid.replace("#10=IFCWINDOW", "#3=IFCWINDOW"),valid.replace("'Correct name'","'Unclosed"),valid+"/* unterminated"] {
            assert!(parse_ifc_text(&bad).is_err());
        }
    }
    #[test]
    fn legacy_ifc2x3_and_ifc4x3_keep_the_same_dimension_order() {
        let valid = file("#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", &window("1.4","0.9"));
        for schema in ["IFC2X3","IFC4X3_ADD2"] { assert_size(&valid.replace("IFC4",schema),900.,1400.); }
    }
    #[cfg(feature="export")]
    #[test]
    fn actual_frame_ifc_export_reimports_without_name_or_size_drift() {
        let frame = crate::kozijn::Kozijn::new("O'Brien frame", "W01", 1234., 2345.);
        let path = std::env::temp_dir().join(format!("spanvision-frame-ifc-{}.ifc",uuid::Uuid::new_v4()));
        crate::export::ifc::generate_ifc(&frame,path.to_str().unwrap()).unwrap();
        let imported = parse_ifc_file(path.to_str().unwrap());
        std::fs::remove_file(path).unwrap();
        let imported = imported.unwrap();
        assert_eq!(imported.windows[0].name, "O'Brien frame");
        assert_eq!(imported.windows[0].properties["Tag"], "W01");
        assert_eq!(imported.windows[0].width_mm,1234.);
        assert_eq!(imported.windows[0].height_mm,2345.);
    }
}
