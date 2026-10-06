//! Simplified rectangular frame GLB, with separate opaque/glazing primitives.
//! Internal dimensions are millimetres; glTF coordinates are metres, Y-up.
use crate::kozijn::{Kozijn, PanelType};

pub fn generate_glb(kozijn: &Kozijn, output_path: &str) -> Result<(), String> {
    super::write_export_bytes(output_path, &generate_glb_bytes(kozijn)?)
}

pub fn generate_glb_bytes(kozijn: &Kozijn) -> Result<Vec<u8>, String> {
    super::ifc::validate_ifc_export(kozijn, super::ifc::LodLevel::Lod300)?;
    let geometry = crate::geometry::compute_2d_geometry(kozijn);
    let height = kozijn.frame.outer_height / 1000.0;
    let depth = kozijn.frame.frame_depth / 1000.0;
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    let mut groups = Vec::new();
    let mut add_box = |r: &crate::geometry::Rect2D, thickness: f64, offset: f64, material: usize| {
        let x = r.x / 1000.0; let y = height - (r.y + r.height) / 1000.0;
        let w = r.width / 1000.0; let h = r.height / 1000.0;
        let z = offset;
        let vertices = [[x,y,z], [x+w,y,z], [x+w,y+h,z], [x,y+h,z],
            [x,y,z+thickness], [x+w,y,z+thickness], [x+w,y+h,z+thickness], [x,y+h,z+thickness]];
        let first = indices.len();
        // Outward CCW winding and distinct face vertices preserve sharp normals.
        for (corners, normal) in [([0,3,2,1],[0.,0.,-1.]), ([4,5,6,7],[0.,0.,1.]),
            ([0,1,5,4],[0.,-1.,0.]), ([3,7,6,2],[0.,1.,0.]),
            ([0,4,7,3],[-1.,0.,0.]), ([1,2,6,5],[1.,0.,0.])] {
            let base = (positions.len() / 3) as u32;
            for corner in corners { positions.extend(vertices[corner].map(|v| v as f32)); normals.extend(normal); }
            indices.extend([base, base+1, base+2, base, base+2, base+3]);
        }
        groups.push((first, indices.len() - first, material));
    };
    for r in geometry.frame_rects.iter().chain(geometry.h_dividers.iter()).chain(geometry.v_dividers.iter()) {
        if r.width > 0.0 && r.height > 0.0 { add_box(r, depth, 0.0, 0); }
    }
    for area in &geometry.cell_rects {
        let cell = kozijn.cells.get(area.cell_index);
        let (glass, fill) = match area.vulling.as_ref() {
            Some(crate::layout::Vakvulling::Buiten) => continue,
            Some(crate::layout::Vakvulling::Paneel { filling }) => (false, filling.as_ref()),
            Some(crate::layout::Vakvulling::Deur { .. } | crate::layout::Vakvulling::Rooster) => (false, None),
            Some(_) => (true, None),
            None => (!matches!(cell.map(|c| c.panel_type), Some(PanelType::Panel | PanelType::Door | PanelType::Ventilation)), cell.and_then(|c| c.panel_filling.as_ref())),
        };
        let thickness = if glass { cell.map(|c| c.glazing.thickness_mm / 1000.0).unwrap_or(0.024) }
            else { fill.map(|p| p.thickness_mm / 1000.0).unwrap_or(depth) };
        let offset = fill.and_then(|p| p.setback_mm).map(|s| s / 1000.0).unwrap_or((depth-thickness)/2.0);
        add_box(&area.rect, thickness, offset, if glass {1} else {2});
    }
    let position_bytes: Vec<u8> = positions.iter().flat_map(|v| v.to_le_bytes()).collect();
    let normal_bytes: Vec<u8> = normals.iter().flat_map(|v| v.to_le_bytes()).collect();
    let index_bytes: Vec<u8> = indices.iter().flat_map(|v| v.to_le_bytes()).collect();
    let normal_offset = position_bytes.len(); let index_offset = normal_offset + normal_bytes.len();
    let mut binary = position_bytes; binary.extend(normal_bytes); binary.extend(index_bytes);
    let min: Vec<f32> = (0..3).map(|a| positions.iter().skip(a).step_by(3).copied().fold(f32::INFINITY, f32::min)).collect();
    let max: Vec<f32> = (0..3).map(|a| positions.iter().skip(a).step_by(3).copied().fold(f32::NEG_INFINITY, f32::max)).collect();
    let mut accessors = vec![serde_json::json!({"bufferView":0,"componentType":5126,"count":positions.len()/3,"type":"VEC3","min":min,"max":max}),
        serde_json::json!({"bufferView":1,"componentType":5126,"count":normals.len()/3,"type":"VEC3"})];
    let mut primitives = Vec::new();
    for (first, count, material) in groups {
        let accessor = accessors.len();
        accessors.push(serde_json::json!({"bufferView":2,"byteOffset":first*4,"componentType":5125,"count":count,"type":"SCALAR"}));
        primitives.push(serde_json::json!({"attributes":{"POSITION":0,"NORMAL":1},"indices":accessor,"material":material}));
    }
    let document = serde_json::json!({
        "asset":{"version":"2.0","generator":"Spanvision Infra / Frame Vision Studio"},
        "scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0,"name":kozijn.name}],
        "meshes":[{"primitives":primitives}],
        "extras":{"geometryScope":"Simplified modeled rectangular members and infills; excludes machining and fittings."},
        "materials":[
            {"name":"Frame","pbrMetallicRoughness":{"baseColorFactor":[0.55,0.35,0.2,1.0],"metallicFactor":0.,"roughnessFactor":0.8}},
            {"name":"Glazing","pbrMetallicRoughness":{"baseColorFactor":[0.7,0.85,0.95,0.3],"metallicFactor":0.,"roughnessFactor":0.1},"alphaMode":"BLEND","doubleSided":true},
            {"name":"Infill","pbrMetallicRoughness":{"baseColorFactor":[0.75,0.75,0.75,1.0],"metallicFactor":0.,"roughnessFactor":0.8}}
        ],
        "accessors":accessors,
        "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":normal_offset,"target":34962},
            {"buffer":0,"byteOffset":normal_offset,"byteLength":index_offset-normal_offset,"target":34962},
            {"buffer":0,"byteOffset":index_offset,"byteLength":binary.len()-index_offset,"target":34963}],
        "buffers":[{"byteLength":binary.len()}]
    });
    let mut json = serde_json::to_vec(&document).map_err(|e| e.to_string())?;
    while json.len() % 4 != 0 { json.push(b' '); }
    let mut bytes = Vec::new();
    bytes.extend(0x46546C67u32.to_le_bytes()); bytes.extend(2u32.to_le_bytes());
    bytes.extend(((12+8+json.len()+8+binary.len()) as u32).to_le_bytes());
    bytes.extend((json.len() as u32).to_le_bytes()); bytes.extend(0x4E4F534Au32.to_le_bytes()); bytes.extend(json);
    bytes.extend((binary.len() as u32).to_le_bytes()); bytes.extend(0x004E4942u32.to_le_bytes()); bytes.extend(binary);
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exported_triangles_face_outwards_and_glazing_uses_its_material() {
        let frame = Kozijn::new("Mesh verification", "MESH", 900.0, 2100.0);
        let bytes = generate_glb_bytes(&frame).unwrap();
        let json_size = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
        let json: serde_json::Value = serde_json::from_slice(&bytes[20..20+json_size]).unwrap();
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize, bytes.len());
        assert_eq!(json["meshes"][0]["primitives"].as_array().unwrap().len(), 5);
        assert_eq!(json["meshes"][0]["primitives"][4]["material"], 1);
        let binary = &bytes[20+json_size+8..];
        let offsets: Vec<usize> = json["bufferViews"].as_array().unwrap().iter().map(|v| v["byteOffset"].as_u64().unwrap() as usize).collect();
        let point = |index: usize, offset: usize| -> [f32;3] {
            std::array::from_fn(|axis| {
                let start = offset + (index*3+axis)*4;
                f32::from_le_bytes(binary[start..start+4].try_into().unwrap())
            })
        };
        let count = json["bufferViews"][2]["byteLength"].as_u64().unwrap() as usize / 4;
        for triangle in (0..count).step_by(3) {
            let ids: [usize;3] = std::array::from_fn(|axis| {
                let start = offsets[2]+(triangle+axis)*4;
                u32::from_le_bytes(binary[start..start+4].try_into().unwrap()) as usize
            });
            let a = point(ids[0],0); let b = point(ids[1],0); let c = point(ids[2],0);
            let u: [f32;3] = std::array::from_fn(|i| b[i]-a[i]);
            let v: [f32;3] = std::array::from_fn(|i| c[i]-a[i]);
            let cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
            let normal = point(ids[0], offsets[1]);
            assert!((0..3).map(|i| cross[i]*normal[i]).sum::<f32>() > 0.0, "reversed or degenerate triangle");
            assert!(normal.iter().all(|v| v.is_finite()));
        }
        assert_eq!(json["accessors"][0]["min"], serde_json::json!([0.,0.,0.]));
        let max = json["accessors"][0]["max"].as_array().unwrap();
        for (actual, expected) in max.iter().zip([0.9,2.1,0.114]) {
            assert!((actual.as_f64().unwrap()-expected).abs() < 1e-6);
        }
    }
}
