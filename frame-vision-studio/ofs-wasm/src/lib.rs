//! WebAssembly bindings for ofs-core.
//!
//! Exposes the same domain logic as the Tauri backend, but callable
//! from JavaScript in a browser. All data passes as JSON strings.

use wasm_bindgen::prelude::*;
use std::sync::Mutex;

use ofs_core::kozijn::{Kozijn, Project};
use ofs_core::production::compute_production_data;

// ── State ──────────────────────────────────────────────────────

static PROJECT: Mutex<Option<Project>> = Mutex::new(None);

/// Read the same explicit IFC dimensions and units as the Windows importer.
#[wasm_bindgen]
pub fn import_ifc_text(content: &str) -> Result<String, String> {
    let result = ofs_core::import::ifc_import::parse_ifc_text(content)?;
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[wasm_bindgen]
pub fn compare_ifc_text(old: &str, new: &str) -> Result<String, String> {
    let old = ofs_core::import::ifc_import::parse_ifc_text(old)?;
    let new = ofs_core::import::ifc_import::parse_ifc_text(new)?;
    serde_json::to_string(&ofs_core::ifc_roundtrip::compare_ifc_imports(&old, &new)).map_err(|e| e.to_string())
}

#[wasm_bindgen]
pub fn compare_project_ifc_text(content: &str) -> Result<String, String> {
    let old = ofs_core::import::ifc_import::parse_ifc_text(content)?;
    with_project(|p| {
        let diff = ofs_core::ifc_roundtrip::compare_project_to_ifc(p, old)?;
        serde_json::to_string(&diff).map_err(|e| e.to_string())
    })?
}

#[wasm_bindgen]
pub fn export_ifc_text(id: &str, lod: Option<String>) -> Result<String, String> {
    use ofs_core::export::ifc::LodLevel;
    let lod = match lod.as_deref().unwrap_or("300") {
        "200" => LodLevel::Lod200, "300" => LodLevel::Lod300, "400" => LodLevel::Lod400,
        _ => return Err("Choose IFC LOD 200, 300 or 400.".into()),
    };
    with_project(|p| {
        let index = find_kozijn(p, id)?;
        ofs_core::export::ifc::validate_ifc_export(&p.kozijnen[index], lod)?;
        Ok(ofs_core::export::ifc::generate_ifc_text_with_lod(&p.kozijnen[index], lod))
    })?
}

#[wasm_bindgen]
pub fn export_dxf_text(id: &str) -> Result<String, String> {
    with_project(|p| {
        let index = find_kozijn(p, id)?;
        ofs_core::export::dxf::generate_dxf_text(&p.kozijnen[index])
    })?
}

#[wasm_bindgen]
pub fn export_glb_bytes(id: &str) -> Result<Vec<u8>, String> {
    with_project(|p| {
        let index = find_kozijn(p, id)?;
        ofs_core::export::gltf::generate_glb_bytes(&p.kozijnen[index])
    })?
}

/// Downloadable PDFs and Excel files use exactly the native generators.
#[wasm_bindgen]
pub fn export_document_bytes(kind: &str, format: &str, id: Option<String>) -> Result<Vec<u8>, String> {
    with_project(|p| {
        match (kind, format) {
            ("schedule", "pdf") => ofs_core::export::pdf::kozijnstaat_pdf_bytes(p),
            ("schedule", "xlsx") => ofs_core::export::xlsx::kozijnstaat_xlsx_bytes(p),
            ("workshop", "pdf") => {
                let index = find_kozijn(p, id.as_deref().ok_or("Select a frame for its workshop drawing.")?)?;
                ofs_core::export::pdf::workshop_pdf_bytes(&p.kozijnen[index],p)
            },
            ("production", "pdf") => ofs_core::export::pdf::production_pdf_bytes(&ofs_core::export::checked_project_production(p)?),
            ("production", "xlsx") => ofs_core::export::xlsx::production_xlsx_bytes(&ofs_core::export::checked_project_production(p)?),
            ("labels", "pdf") => ofs_core::export::pdf_labels::generate_labels_pdf(p,&Default::default()),
            ("quotation", "pdf") => ofs_core::export::pdf_quotation::project_quotation_pdf_bytes(p),
            _ => Err("Unsupported document format. Choose PDF or Excel for this export.".into()),
        }
    })?
}

fn with_project<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut Project) -> R,
{
    let mut guard = PROJECT.lock().map_err(|e| e.to_string())?;
    let project = guard.get_or_insert_with(|| Project::new("New project", ""));
    Ok(f(project))
}

fn find_kozijn(project: &Project, id: &str) -> Result<usize, String> {
    let uuid: uuid::Uuid = id.parse().map_err(|e: uuid::Error| e.to_string())?;
    project
        .kozijnen
        .iter()
        .position(|k| k.id == uuid)
        .ok_or_else(|| "Kozijn niet gevonden".into())
}

// ── Project commands ───────────────────────────────────────────

#[wasm_bindgen]
pub fn get_project() -> Result<String, String> {
    with_project(|p| serde_json::to_string(p).unwrap())
}

#[wasm_bindgen]
pub fn new_project(name: &str, number: &str) -> Result<String, String> {
    let mut guard = PROJECT.lock().map_err(|e| e.to_string())?;
    let project = Project::new(name, number);
    let json = serde_json::to_string(&project).map_err(|e| e.to_string())?;
    *guard = Some(project);
    Ok(json)
}

#[wasm_bindgen]
pub fn open_project_json(json: &str) -> Result<String, String> {
    let project = Project::from_document_json(json)?;
    let result = serde_json::to_string(&project).map_err(|e| e.to_string())?;
    let mut guard = PROJECT.lock().map_err(|e| e.to_string())?;
    *guard = Some(project);
    Ok(result)
}

#[wasm_bindgen]
pub fn save_project_json() -> Result<String, String> {
    with_project(|p| serde_json::to_string(p).unwrap())
}

// ── Kozijn CRUD ────────────────────────────────────────────────

#[wasm_bindgen]
pub fn create_kozijn(name: &str, mark: &str, width: f64, height: f64) -> Result<String, String> {
    with_project(|p| {
        let k = Kozijn::new(name, mark, width, height);
        let json = serde_json::to_string(&k).unwrap();
        p.kozijnen.push(k);
        json
    })
}

#[wasm_bindgen]
pub fn create_kozijn_from_template(
    template: &str,
    width: f64,
    height: f64,
    sjabloon_id: Option<String>,
) -> Result<String, String> {
    let sj = match sjabloon_id {
        Some(id) => ofs_core::template::get_sjabloon(&id),
        None => ofs_core::template::default_sjabloon(),
    };
    with_project(|p| {
        let k = match template {
            "single_turn_tilt" => ofs_core::grid::template_single_turn_tilt_sj(width, height, &sj),
            "double_turn_tilt" => ofs_core::grid::template_double_turn_tilt_sj(width, height, &sj),
            "sliding_door" => ofs_core::grid::template_sliding_door_sj(width, height, &sj),
            "front_door" => ofs_core::grid::template_front_door_sj(width, height, &sj),
            "klapraam" => ofs_core::grid::template_top_hung_sj(width, height, &sj),
            "hefschuif" => ofs_core::grid::template_lift_slide_sj(width, height, &sj),
            "pivot" => ofs_core::grid::template_pivot_sj(width, height, &sj),
            "stolp" => ofs_core::grid::template_stolp_sj(width, height, &sj),
            _ => Kozijn::new_with_sjabloon("Kozijn", "K01", width, height, &sj),
        };
        let json = serde_json::to_string(&k).unwrap();
        p.kozijnen.push(k);
        json
    })
}

#[wasm_bindgen]
pub fn get_kozijn(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn get_all_kozijnen() -> Result<String, String> {
    with_project(|p| serde_json::to_string(&p.kozijnen).unwrap())
}

#[wasm_bindgen]
pub fn remove_kozijn(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        p.kozijnen.remove(idx);
        Ok("ok".into())
    })?
}

#[wasm_bindgen]
pub fn duplicate_kozijn(id: &str, new_mark: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let mut dup = p.kozijnen[idx].clone();
        dup.id = uuid::Uuid::new_v4();
        dup.mark = new_mark.to_string();
        let json = serde_json::to_string(&dup).unwrap();
        p.kozijnen.push(dup);
        Ok(json)
    })?
}

// ── Kozijn mutations ───────────────────────────────────────────

#[wasm_bindgen]
pub fn update_kozijn_dimensions(id: &str, width: f64, height: f64) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        k.frame.outer_width = width;
        k.frame.outer_height = height;
        // Recalculate grid
        let fw = k.frame.frame_width;
        if k.grid.columns.len() == 1 {
            k.grid.columns[0].size = width - 2.0 * fw;
        }
        if k.grid.rows.len() == 1 {
            k.grid.rows[0].size = height - 2.0 * fw;
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_cell_type(
    id: &str,
    cell_index: usize,
    panel_type: &str,
    opening_direction: Option<String>,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        if cell_index < k.cells.len() {
            if let Ok(pt) = serde_json::from_str::<ofs_core::kozijn::PanelType>(&format!("\"{}\"", panel_type)) {
                k.cells[cell_index].panel_type = pt;
            }
            k.cells[cell_index].opening_direction = opening_direction
                .as_deref()
                .and_then(|d| serde_json::from_str(&format!("\"{}\"", d)).ok());
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_cell_panel_filling(
    id: &str,
    cell_index: usize,
    panel_filling_json: &str,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        if cell_index < k.cells.len() {
            if let Ok(filling) = serde_json::from_str::<ofs_core::panel_filling::PanelFilling>(panel_filling_json) {
                k.cells[cell_index].panel_filling = Some(filling);
            }
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_cell_glaslat(
    id: &str,
    cell_index: usize,
    glaslat_json: &str,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        if cell_index < k.cells.len() {
            if let Ok(glaslat) = serde_json::from_str::<ofs_core::glaslat::Glaslat>(glaslat_json) {
                k.cells[cell_index].glaslat = Some(glaslat);
            }
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_kozijn_layout(
    id: &str,
    layout_json: &str,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let trimmed = layout_json.trim();
        p.kozijnen[idx].layout = if trimmed.is_empty() || trimmed == "null" {
            None
        } else {
            Some(serde_json::from_str::<ofs_core::layout::VakNode>(trimmed).map_err(|e| e.to_string())?)
        };
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_cell_escape(
    id: &str,
    cell_index: usize,
    is_escape: bool,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        if cell_index < k.cells.len() {
            k.cells[cell_index].is_escape = is_escape;
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_cell_sash_profile(
    id: &str,
    cell_index: usize,
    profile_id: &str,
    profile_name: &str,
    sash_width: f64,
    sash_depth: f64,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        let cell = k.cells.get_mut(cell_index).ok_or("Cel niet gevonden")?;
        cell.sash_profile = Some(ofs_core::profile::ProfileRef {
            id: profile_id.to_string(),
            name: profile_name.to_string(),
        });
        cell.sash_width = Some(sash_width);
        cell.sash_depth = Some(sash_depth);
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_edge_config(
    id: &str,
    edge_index: usize,
    edge_json: &str,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let edge: ofs_core::edge::EdgeConfig = serde_json::from_str(edge_json)
            .map_err(|e| format!("Ongeldig edge JSON: {}", e))?;
        let k = &mut p.kozijnen[idx];
        // Ensure edges vector has 4 entries (left, right, top, bottom)
        while k.frame.edges.len() < 4 {
            k.frame.edges.push(ofs_core::edge::EdgeConfig::default());
        }
        if edge_index < 4 {
            k.frame.edges[edge_index] = edge;
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_corner_joints(id: &str, joints_json: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let joints: Vec<ofs_core::joint::Joint> = serde_json::from_str(joints_json)
            .map_err(|e| format!("Ongeldige joints JSON: {}", e))?;
        p.kozijnen[idx].frame.corner_joints = joints;
        // Explicitly saved joints always win from now on, even when they
        // equal the auto-populated default set (see Frame::joints_configured).
        p.kozijnen[idx].frame.joints_configured = true;
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_frame_shape(
    id: &str,
    shape_type: &str,
    arch_height: Option<f64>,
    top_width: Option<f64>,
    left_angle: Option<f64>,
    right_angle: Option<f64>,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let st: ofs_core::kozijn::ShapeType =
            serde_json::from_str(&format!("\"{}\"", shape_type))
                .map_err(|e| format!("Ongeldig shape type: {}", e))?;
        let k = &mut p.kozijnen[idx];
        // Merge with the existing shape: None arguments keep the stored value
        // (same semantics as the Tauri command).
        let prev = k.frame.shape.clone();
        k.frame.shape = ofs_core::kozijn::FrameShape {
            shape_type: st,
            arch_radius: prev.arch_radius,
            arch_height: arch_height.or(prev.arch_height),
            top_width: top_width.or(prev.top_width),
            left_angle: left_angle.or(prev.left_angle),
            right_angle: right_angle.or(prev.right_angle),
            ellipse_rx: prev.ellipse_rx,
            ellipse_ry: prev.ellipse_ry,
            polygon_points: prev.polygon_points,
            apex_offset: prev.apex_offset,
        };
        // Round frames have no grid dividers: normalize to a single 1×1 cell
        if st == ofs_core::kozijn::ShapeType::Round {
            ofs_core::geometry::normalize_grid_single_cell(k);
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_frame_profile(
    id: &str,
    profile_id: &str,
    profile_name: &str,
    profile_width: Option<f64>,
    profile_depth: Option<f64>,
    profile_snapshot_json: Option<String>,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        k.frame.profile = ofs_core::profile::ProfileRef {
            id: profile_id.to_string(),
            name: profile_name.to_string(),
        };
        if let Some(w) = profile_width {
            let old_fw = k.frame.frame_width;
            k.frame.frame_width = w;
            // Rescale the grid to the new frame width (same semantics as the
            // Tauri command).
            let old_inner = k.frame.outer_width - 2.0 * old_fw;
            let new_inner = k.frame.outer_width - 2.0 * w;
            if old_inner > 0.0 && new_inner > 0.0 {
                let scale = new_inner / old_inner;
                for col in &mut k.grid.columns {
                    col.size *= scale;
                }
            }
            let old_inner_h = k.frame.outer_height - 2.0 * old_fw;
            let new_inner_h = k.frame.outer_height - 2.0 * w;
            if old_inner_h > 0.0 && new_inner_h > 0.0 {
                let scale_h = new_inner_h / old_inner_h;
                for row in &mut k.grid.rows {
                    row.size *= scale_h;
                }
            }
        }
        if let Some(d) = profile_depth {
            k.frame.frame_depth = d;
        }
        // Resolved snapshot: explicit "null"/empty clears it, an omitted
        // argument leaves the stored snapshot untouched.
        if let Some(json) = profile_snapshot_json {
            let trimmed = json.trim();
            k.frame.profile_snapshot = if trimmed.is_empty() || trimmed == "null" {
                None
            } else {
                Some(
                    serde_json::from_str::<ofs_core::profile::ProfileSnapshot>(trimmed)
                        .map_err(|e| format!("Ongeldig profielsnapshot JSON: {}", e))?,
                )
            };
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_sill_profile(
    id: &str,
    profile_id: &str,
    profile_name: &str,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        p.kozijnen[idx].frame.sill_profile = Some(ofs_core::profile::ProfileRef {
            id: profile_id.to_string(),
            name: profile_name.to_string(),
        });
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn update_member_profile(
    id: &str,
    member_type: &str,
    member_index: Option<u32>,
    profile_id: &str,
    profile_name: &str,
    _profile_width: Option<f64>,
    _profile_depth: Option<f64>,
) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &mut p.kozijnen[idx];
        let profile = ofs_core::profile::ProfileRef {
            id: profile_id.to_string(),
            name: profile_name.to_string(),
        };
        // Same member mapping as the Tauri command: per-member frame
        // overrides, dividers by index (+1: the first column/row carries no
        // divider). Width/depth are accepted but not applied per-member (the
        // Tauri command ignores them too — per-member widths need geometry
        // support first).
        match member_type {
            "frame_top" => k.frame.top_profile = Some(profile),
            "frame_bottom" => k.frame.bottom_profile = Some(profile),
            "frame_left" => k.frame.left_profile = Some(profile),
            "frame_right" => k.frame.right_profile = Some(profile),
            "divider_v" => {
                if let Some(i) = member_index {
                    if let Some(col) = k.grid.columns.get_mut(i as usize + 1) {
                        col.divider_profile = Some(profile);
                    }
                }
            }
            "divider_h" => {
                if let Some(i) = member_index {
                    if let Some(row) = k.grid.rows.get_mut(i as usize + 1) {
                        row.divider_profile = Some(profile);
                    }
                }
            }
            _ => return Err(format!("Onbekend member type: {}", member_type)),
        }
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn add_column(id: &str, position: f64) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        p.kozijnen[idx].add_column(position);
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

#[wasm_bindgen]
pub fn add_row(id: &str, position: f64) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        p.kozijnen[idx].add_row(position);
        Ok(serde_json::to_string(&p.kozijnen[idx]).unwrap())
    })?
}

// ── Custom profiles ────────────────────────────────────────────

#[wasm_bindgen]
pub fn get_custom_profiles() -> Result<String, String> {
    with_project(|p| serde_json::to_string(&p.custom_profiles).unwrap())
}

#[wasm_bindgen]
pub fn add_custom_profile(profile_json: &str) -> Result<(), String> {
    with_project(|p| ofs_core::profile::store_custom_profile(p, profile_json))?
}

// ── Geometry ───────────────────────────────────────────────────

#[wasm_bindgen]
pub fn get_kozijn_geometry(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let geom = ofs_core::geometry::compute_2d_geometry(&p.kozijnen[idx]);
        Ok(serde_json::to_string(&geom).unwrap())
    })?
}

// ── Production ─────────────────────────────────────────────────

#[wasm_bindgen]
pub fn get_production_data_project() -> Result<String, String> {
    with_project(|p| {
        let data: Vec<_> = p.kozijnen.iter().map(|k| compute_production_data(k)).collect();
        serde_json::to_string(&data).unwrap()
    })
}

// ── Energy (BENG / Bouwbesluit) ─────────────────────────────────

#[wasm_bindgen]
pub fn get_project_energy(max_uw: f64) -> Result<String, String> {
    with_project(|p| {
        let profiles = p.custom_profiles.clone();
        let result = ofs_core::energy::calculate_project_energy(p, &profiles, max_uw);
        serde_json::to_string(&result).unwrap()
    })
}

// ── Certification (CE / SKH / KOMO) ─────────────────────────────

#[wasm_bindgen]
pub fn check_certification(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &p.kozijnen[idx];
        let profiles = &p.custom_profiles;
        let result = serde_json::json!({
            "ceMarking": ofs_core::certification::check_ce_marking(k, profiles),
            "skhKomo": ofs_core::certification::check_skh_komo(k),
            "performanceClass": ofs_core::performance_class::classify_performance(k, profiles),
        });
        Ok(serde_json::to_string(&result).unwrap())
    })?
}

// ── Circularity / material passport ─────────────────────────────

#[wasm_bindgen]
pub fn get_project_circularity() -> Result<String, String> {
    with_project(|p| {
        let result = ofs_core::circularity::calculate_project_circularity(p);
        serde_json::to_string(&result).unwrap()
    })
}

// ── Purchase orders (per-supplier) ──────────────────────────────

#[wasm_bindgen]
pub fn generate_purchase_orders() -> Result<String, String> {
    with_project(|p| {
        let orders = ofs_core::purchase_order::generate_purchase_orders(p);
        serde_json::to_string(&orders).unwrap()
    })
}

// ── Plausibility (indicative static wind-load) ──────────────────

#[wasm_bindgen]
pub fn get_project_plausibility(wind_pressure_pa: f64) -> Result<String, String> {
    with_project(|p| {
        let result = ofs_core::plausibility::calculate_project_plausibility(p, wind_pressure_pa);
        serde_json::to_string(&result).unwrap()
    })
}

// ── Declaration of Performance (DoP) ────────────────────────────

#[wasm_bindgen]
pub fn generate_dop_for_kozijn(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let dop = ofs_core::dop::generate_dop(&p.kozijnen[idx], &p.custom_profiles);
        Ok(serde_json::to_string(&dop).unwrap())
    })?
}

// ── Thermal ────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn calculate_thermal(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let result = ofs_core::thermal::calculate_uw(&p.kozijnen[idx], &[]);
        Ok(serde_json::to_string(&result).unwrap())
    })?
}

// ── Export data (returns JSON for JS-side file generation) ──────

#[wasm_bindgen]
pub fn get_export_data(id: &str) -> Result<String, String> {
    with_project(|p| {
        let idx = find_kozijn(p, id)?;
        let k = &p.kozijnen[idx];
        let prod = compute_production_data(k);
        let result = serde_json::json!({
            "kozijn": k,
            "production": prod,
        });
        Ok(serde_json::to_string(&result).unwrap())
    })?
}

#[wasm_bindgen]
pub fn get_project_export_data() -> Result<String, String> {
    with_project(|p| {
        let data: Vec<_> = p.kozijnen.iter().map(|k| {
            let prod = compute_production_data(k);
            serde_json::json!({ "kozijn": k, "production": prod })
        }).collect();
        serde_json::to_string(&data).unwrap()
    })
}

#[wasm_bindgen]
pub fn export_production_csv_files() -> Result<String, String> {
    with_project(|p| {
        let data = ofs_core::export::checked_project_production(p)?;
        serde_json::to_string(&ofs_core::export::csv_production::production_csv_files(&data)?).map_err(|e| e.to_string())
    })?
}

/// Browser commands use the same calculation and production functions as Tauri.
/// Returning JSON keeps the WASM interface stable without recreating algorithms in JS.
#[wasm_bindgen]
pub fn execute_project_command(command: &str, args_json: &str) -> Result<String, String> {
    use serde_json::{json, Value};
    use ofs_core::calculation::{estimate_cost, PriceTable};
    let args: Value = serde_json::from_str(args_json).map_err(|e| e.to_string())?;
    let text = |key: &str| args[key].as_str().ok_or_else(|| format!("Missing {key}"));
    let number = |key: &str| args[key].as_f64().filter(|value| value.is_finite()).ok_or_else(|| format!("Missing finite {key}"));
    let prices = || -> Result<PriceTable, String> {
        match args["priceTableJson"].as_str() {
            Some(value) => serde_json::from_str(value).map_err(|e| e.to_string()),
            None => Ok(PriceTable::default()),
        }
    };
    let value = with_project(|p| -> Result<Value, String> {
        match command {
            "get_cost_estimate" => {
                let index = find_kozijn(p, text("id")?)?;
                Ok(json!(estimate_cost(&p.kozijnen[index], &prices()?)))
            }
            "get_cost_estimate_project" => {
                let table = prices()?;
                Ok(json!(p.kozijnen.iter().map(|k| estimate_cost(k, &table)).collect::<Vec<_>>()))
            }
            "get_glass_library" => Ok(json!(ofs_core::glass_library::builtin_glass_library())),
            "get_cnc_parts" | "export_cnc_gcode" => {
                let index = find_kozijn(p, text("id")?)?;
                let parts = ofs_core::cnc::generate_cnc_parts(&p.kozijnen[index]);
                if command == "get_cnc_parts" { return Ok(json!(parts)); }
                use ofs_core::cnc::postprocessor::CncPostProcessor;
                Ok(json!(ofs_core::cnc::gcode::GenericGCode.generate(&parts)?))
            }
            "optimize_project_cut_list" => {
                let stock = args["stockLengthMm"].as_f64().unwrap_or(5800.0);
                if !stock.is_finite() || stock <= 4.0 { return Err("Stock length must exceed the saw kerf".into()); }
                let pieces = p.kozijnen.iter().flat_map(|k| {
                    let data = compute_production_data(k);
                    data.cut_list.into_iter().map(move |cut| (cut.piece_id, data.kozijn_mark.clone(), cut.gross_length_mm))
                }).collect();
                Ok(json!(ofs_core::optimization::optimize_cut_list(pieces, stock, 4.0)?))
            }
            "get_production_plan" => {
                let hours = args["hoursPerDay"].as_f64().unwrap_or(8.0);
                let workers = args["workers"].as_u64().unwrap_or(2);
                if !(0.0..=24.0).contains(&hours) || hours == 0.0 || workers == 0 || workers > 10000 {
                    return Err("Use positive work hours (up to 24) and a valid worker count".into());
                }
                Ok(json!(ofs_core::planning::generate_production_plan(p, hours, workers as u32)))
            }
            "get_all_vliesgevels" => Ok(json!(p.vliesgevels)),
            "create_vliesgevel" | "create_vliesgevel_from_template" => {
                use ofs_core::vliesgevel::grid;
                let width = number("width")?;
                let height = number("height")?;
                let mut wall = if command == "create_vliesgevel" {
                    grid::create_regular_grid(width, height, number("mullionSpacing")?, number("transomSpacing")?)?
                } else {
                    match text("template")? {
                        "stick_system" => grid::template_stick_system(width, height)?,
                        "unitized" => grid::template_unitized(width, height)?,
                        "shopfront" => grid::template_shopfront(width, height)?,
                        _ => return Err("Unknown curtain wall template".into()),
                    }
                };
                wall.name = args["name"].as_str().unwrap_or("Curtain wall").into();
                wall.mark = args["mark"].as_str().unwrap_or("CW01").into();
                p.vliesgevels.push(wall.clone());
                Ok(json!(wall))
            }
            "get_vliesgevel" | "get_vliesgevel_geometry" | "get_vliesgevel_production" |
            "remove_vliesgevel" | "vliesgevel_add_mullion" | "vliesgevel_add_transom" |
            "vliesgevel_remove_mullion" | "vliesgevel_remove_transom" | "vliesgevel_update_panel" => {
                let id: uuid::Uuid = text("id")?.parse().map_err(|e: uuid::Error| e.to_string())?;
                let index = p.vliesgevels.iter().position(|v| v.id == id).ok_or("Curtain wall not found")?;
                if command == "remove_vliesgevel" { p.vliesgevels.remove(index); return Ok(Value::Null); }
                let wall = &mut p.vliesgevels[index];
                match command {
                    "get_vliesgevel_geometry" => return Ok(json!(ofs_core::vliesgevel::geometry::compute_vliesgevel_2d(wall))),
                    "get_vliesgevel_production" => return Ok(json!(ofs_core::vliesgevel::production::compute_vliesgevel_production(wall))),
                    "vliesgevel_add_mullion" | "vliesgevel_add_transom" => {
                        let vertical = command == "vliesgevel_add_mullion";
                        let position = number(if vertical { "xPosition" } else { "yPosition" })?;
                        let limit = if vertical { wall.overall_width } else { wall.overall_height };
                        if position <= 0.0 || position >= limit { return Err("Member position must lie inside the curtain wall".into()); }
                        if (wall.num_cols() + 1) * (wall.num_rows() + 1) > 10000 { return Err("Curtain wall panel limit reached".into()); }
                        if vertical { wall.add_mullion(position); } else { wall.add_transom(position); }
                    }
                    "vliesgevel_remove_mullion" | "vliesgevel_remove_transom" => {
                        let vertical = command == "vliesgevel_remove_mullion";
                        let key = if vertical { "mullionIndex" } else { "transomIndex" };
                        let member = args[key].as_u64().or_else(|| args["index"].as_u64()).ok_or("Missing member index")? as usize;
                        let count = if vertical { wall.mullions.len() } else { wall.transoms.len() };
                        if member >= count { return Err("Curtain wall member not found".into()); }
                        if vertical { wall.remove_mullion(member); } else { wall.remove_transom(member); }
                    }
                    "vliesgevel_update_panel" => {
                        let col = args["col"].as_u64().ok_or("Missing panel column")? as usize;
                        let row = args["row"].as_u64().ok_or("Missing panel row")? as usize;
                        let panel_type = serde_json::from_value(args["panelType"].clone()).map_err(|e| e.to_string())?;
                        let panel = wall.panel_at_mut(col, row).ok_or("Curtain wall panel not found")?;
                        panel.panel_type = panel_type;
                    }
                    _ => {}
                }
                Ok(json!(wall))
            }
            "validate_project_ids" => {
                use ofs_core::ids::{IdsRequirement, IdsCheckResult};
                let requirements: Vec<IdsRequirement> = match args["requirementsJson"].as_str() {
                    Some(value) => serde_json::from_str(value).map_err(|e| e.to_string())?,
                    None => ofs_core::ids::default_ids_requirements(),
                };
                let mut results = Vec::new();
                for k in &p.kozijnen {
                    results.extend(ofs_core::ids::validate_kozijn(k, &p.custom_profiles, &requirements));
                    let errors = ofs_core::validation::validate(k);
                    results.push(IdsCheckResult { requirement: "Geometry.KVT".into(), kozijn_mark: k.mark.clone(),
                        passed: errors.is_empty(), actual_value: None,
                        message: if errors.is_empty() { "OK".into() } else { errors.iter().map(ToString::to_string).collect::<Vec<_>>().join("; ") } });
                }
                for vg in &p.vliesgevels {
                    let errors = ofs_core::vliesgevel::validation::validate_vliesgevel(vg);
                    results.push(IdsCheckResult { requirement: "CurtainWall.Geometry".into(), kozijn_mark: vg.mark.clone(),
                        passed: errors.is_empty(), actual_value: None,
                        message: if errors.is_empty() { "OK".into() } else { errors.iter().map(ToString::to_string).collect::<Vec<_>>().join("; ") } });
                }
                Ok(json!(results))
            }
            "auto_select_hardware" | "update_security_class" => {
                let index = find_kozijn(p, text("id")?)?;
                let k = &mut p.kozijnen[index];
                let cell_index = args["cellIndex"].as_u64().ok_or("Missing cell index")? as usize;
                if k.grid.columns.is_empty() { return Err("Frame grid is empty".into()); }
                let cell = k.cells.get_mut(cell_index).ok_or("Cell not found")?;
                let width = k.grid.columns.get(cell_index % k.grid.columns.len()).ok_or("Column not found")?.size;
                let height = k.grid.rows.get(cell_index / k.grid.columns.len()).ok_or("Row not found")?.size;
                let security = if command == "update_security_class" {
                    serde_json::from_value(args["securityClass"].clone()).map_err(|e| e.to_string())?
                } else { cell.hardware_set.as_ref().map(|h| h.security_class).unwrap_or_default() };
                cell.hardware_set = ofs_core::hardware::default_hardware_set(cell.panel_type, cell.opening_direction,
                    width, height, cell.glazing.thickness_mm, &k.frame.material, security);
                Ok(json!(k))
            }
            "get_quotations" => Ok(json!(p.quotations)),
            "create_quotation" => {
                let quotation = if args["totalInclBtw"].is_null() && args["kozijnMarks"].is_null() {
                    ofs_core::quotation::Quotation::from_project(p)?
                } else {
                    let total = args["totalInclBtw"].as_f64().ok_or("Missing quotation total")?;
                    ofs_core::quotation::Quotation::validate_amount(total)?;
                    let marks: Vec<String> = serde_json::from_value(args["kozijnMarks"].clone()).map_err(|e| e.to_string())?;
                    if marks.is_empty() || marks.iter().any(|mark| !p.kozijnen.iter().any(|frame| &frame.mark == mark)) {
                        return Err("Choose existing project frames before creating a quotation.".into());
                    }
                    ofs_core::quotation::Quotation::new_draft(marks, total)
                };
                p.quotations.push(quotation.clone()); Ok(json!(quotation))
            }
            "update_quotation_status" => {
                let quotation = p.quotations.iter_mut().find(|q| q.id == text("quotationId").unwrap_or("")).ok_or("Quotation not found")?;
                quotation.status = serde_json::from_value(args["status"].clone()).map_err(|e| e.to_string())?;
                Ok(json!(quotation))
            }
            "create_quotation_revision" => {
                let total = args["newTotal"].as_f64().ok_or("Missing quotation total")?;
                ofs_core::quotation::Quotation::validate_amount(total)?;
                if text("changeDescription")?.trim().is_empty() { return Err("Describe the quotation revision.".into()); }
                let quotation = p.quotations.iter().find(|q| q.id == text("quotationId").unwrap_or("")).ok_or("Quotation not found")?;
                if quotation.version == u32::MAX { return Err("This quotation has reached the maximum revision number.".into()); }
                let revision = quotation.create_revision(total, text("changeDescription")?);
                p.quotations.push(revision.clone()); Ok(json!(revision))
            }
            _ => Err(format!("Unsupported browser command: {command}")),
        }
    })??;
    serde_json::to_string(&value).map_err(|e| e.to_string())
}
