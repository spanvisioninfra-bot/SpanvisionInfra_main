use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use crate::import::ifc_import::IfcImportResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IfcDiff {
    pub added: Vec<DiffItem>, pub removed: Vec<DiffItem>,
    pub modified: Vec<DiffModification>, pub unchanged: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffItem {
    pub guid: String, pub name: String, pub entity_type: String, pub tag: String,
    pub width_mm: f64, pub height_mm: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffModification { pub guid: String, pub name: String, pub changes: Vec<PropertyChange> }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyChange { pub property: String, pub old_value: String, pub new_value: String }

fn items(result: &IfcImportResult) -> BTreeMap<&str, DiffItem> {
    result.windows.iter().map(|w| (w.guid.as_str(), DiffItem {
        guid: w.guid.clone(), name: w.name.clone(), entity_type: "Window".into(), tag: w.properties.get("Tag").cloned().unwrap_or_default(),
        width_mm: w.width_mm, height_mm: w.height_mm,
    })).chain(result.doors.iter().map(|d| (d.guid.as_str(), DiffItem {
        guid: d.guid.clone(), name: d.name.clone(), entity_type: "Door".into(), tag: d.properties.get("Tag").cloned().unwrap_or_default(),
        width_mm: d.width_mm, height_mm: d.height_mm,
    }))).collect()
}

/// Compare supported identities and explicit dimensions, not arbitrary IFC geometry/psets.
/// Sorted keys keep results stable; submillimetre edits must not disappear in rounding.
pub fn compare_ifc_imports(old: &IfcImportResult, new: &IfcImportResult) -> IfcDiff {
    let old_items = items(old); let new_items = items(new);
    let mut diff = IfcDiff { added: vec![], removed: vec![], modified: vec![], unchanged: 0 };
    for (key, item) in &new_items {
        let Some(previous) = old_items.get(key) else { diff.added.push(item.clone()); continue; };
        let mut changes = Vec::new();
        for (property, a, b) in [("Name", &previous.name, &item.name), ("Type", &previous.entity_type, &item.entity_type), ("Tag", &previous.tag, &item.tag)] {
            if a != b { changes.push(PropertyChange { property: property.into(), old_value: a.clone(), new_value: b.clone() }); }
        }
        for (property, a, b) in [("Width", previous.width_mm, item.width_mm), ("Height", previous.height_mm, item.height_mm)] {
            if (a - b).abs() > 1e-6 { changes.push(PropertyChange {
                property: property.into(), old_value: format!("{a} mm"), new_value: format!("{b} mm"),
            }); }
        }
        if changes.is_empty() { diff.unchanged += 1; }
        else { diff.modified.push(DiffModification { guid: key.to_string(), name: item.name.clone(), changes }); }
    }
    for (key, item) in old_items { if !new_items.contains_key(key) { diff.removed.push(item); } }
    diff
}

/// Roundtrip matching uses unique IFC Tags (model marks), falling back to
/// stable GlobalIds when Tag is absent. Names are not unique identities.
fn key_by_tag(result: &mut IfcImportResult) -> Result<(), String> {
    let mut keys = HashSet::new();
    for (guid, properties) in result.windows.iter_mut().map(|w| (&mut w.guid, &w.properties))
        .chain(result.doors.iter_mut().map(|d| (&mut d.guid, &d.properties))) {
        let key = match properties.get("Tag").filter(|s| !s.trim().is_empty()) {
            Some(tag) => format!("Tag:{tag}"), None => format!("GlobalId:{guid}"),
        };
        if !keys.insert(key.clone()) { return Err(format!("IFC roundtrip cannot match duplicate identity {key}. Use unique frame marks/Tags.")); }
        *guid = key;
    }
    Ok(())
}

/// Both browser and native operations use memory, avoiding shared temp-file races.
pub fn compare_project_to_ifc(project: &crate::kozijn::Project, mut old: IfcImportResult) -> Result<IfcDiff, String> {
    let mut new = IfcImportResult { windows: vec![], doors: vec![], openings: vec![] };
    for frame in &project.kozijnen {
        crate::export::ifc::validate_ifc_export(frame, crate::export::ifc::LodLevel::default())?;
        let text = crate::export::ifc::generate_ifc_text(frame);
        let imported = crate::import::ifc_import::parse_ifc_text(&text)?;
        new.windows.extend(imported.windows); new.doors.extend(imported.doors);
    }
    key_by_tag(&mut old)?; key_by_tag(&mut new)?;
    Ok(compare_ifc_imports(&old, &new))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kozijn::{Kozijn, Project, PanelType};
    use crate::import::ifc_import::parse_ifc_text;
    use crate::export::ifc::generate_ifc_text;
    #[test]
    fn captures_renames_type_changes_and_fractional_dimensions() {
        let mut frame = Kozijn::new("Original", "ONE", 900.0, 2100.0);
        let old = parse_ifc_text(&generate_ifc_text(&frame)).unwrap();
        frame.name = "Renamed".into(); frame.frame.outer_width += 0.25;
        frame.cells[0].panel_type = PanelType::Door;
        let new = parse_ifc_text(&generate_ifc_text(&frame)).unwrap();
        let diff = compare_ifc_imports(&old, &new);
        assert!(diff.added.is_empty()); assert!(diff.removed.is_empty()); assert_eq!(diff.modified.len(), 1);
        assert_eq!(diff.modified[0].changes.iter().map(|p| p.property.as_str()).collect::<Vec<_>>(), vec!["Name", "Type", "Width"]);
        assert_eq!(diff.modified[0].changes[2].new_value, "900.25 mm");
    }
    #[test]
    fn project_roundtrip_matches_unique_tags_and_rejects_ambiguity() {
        let mut project = Project::new("Roundtrip", "");
        let frame = Kozijn::new("Repeated name", "ONE", 900.0, 2100.0);
        let old = parse_ifc_text(&generate_ifc_text(&frame)).unwrap();
        let mut independent = frame.clone(); independent.id = uuid::Uuid::new_v4();
        project.kozijnen.push(independent);
        assert_eq!(compare_project_to_ifc(&project, old.clone()).unwrap().unchanged, 1);
        project.kozijnen[0].frame.outer_height += 0.5;
        assert_eq!(compare_project_to_ifc(&project, old.clone()).unwrap().modified.len(), 1);
        project.kozijnen.push(frame);
        assert!(compare_project_to_ifc(&project, old).unwrap_err().contains("duplicate identity Tag:ONE"));
    }
}
