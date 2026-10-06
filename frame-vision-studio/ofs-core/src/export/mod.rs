//! Export modules — replaces Python sidecar for file generation.

pub mod gltf;
pub mod dxf;
pub mod ifc;
pub mod csv_production;

/// Current cut calculations are supported for rectangular grid frames. Do not
/// silently derive workshop orders from an unsupported curved/free layout.
pub fn checked_project_production(project: &crate::kozijn::Project) -> Result<Vec<crate::production::ProductionData>, String> {
    if project.kozijnen.is_empty() { return Err("Add a frame before exporting production documents.".into()); }
    for frame in &project.kozijnen {
        if frame.layout.is_some() || !frame.extensions.is_empty() {
            return Err("Production documents currently support rectangular grid frames without extensions. Export smaller supported batches.".into());
        }
        ifc::validate_ifc_export(frame, ifc::LodLevel::Lod300)?;
    }
    Ok(project.kozijnen.iter().map(crate::production::compute_production_data).collect())
}

/// Write in the destination directory and replace only after a complete flush.
/// A failed export leaves the previous document intact and cleans up its temp file.
pub fn write_export_bytes(output_path: &str, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let target = std::path::Path::new(output_path);
    let parent = target.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(std::path::Path::new("."));
    let temporary = parent.join(format!(".frame-export-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new().create_new(true).write(true).open(&temporary)
            .map_err(|e| format!("Cannot create export file: {e}"))?;
        file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| format!("Cannot finish export: {e}"))?;
        drop(file);
        std::fs::rename(&temporary, target).map_err(|e| format!("Cannot replace export destination: {e}"))
    })();
    if result.is_err() { let _ = std::fs::remove_file(&temporary); }
    result
}

#[cfg(test)]
mod file_tests {
    #[test]
    fn replaces_completed_exports_and_preserves_destination_on_failure() {
        let root = std::env::temp_dir().join(format!("frame-export-check-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let target = root.join("existing.ifc");
        std::fs::write(&target, b"previous document").unwrap();
        super::write_export_bytes(target.to_str().unwrap(), b"complete document").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"complete document");
        let directory = root.join("protected-directory");
        std::fs::create_dir(&directory).unwrap();
        let sentinel = directory.join("previous.ifc");
        std::fs::write(&sentinel, b"keep").unwrap();
        assert!(super::write_export_bytes(directory.to_str().unwrap(), b"cannot replace a directory").is_err());
        assert_eq!(std::fs::read(&sentinel).unwrap(), b"keep");
        assert!(!std::fs::read_dir(&root).unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().ends_with(".tmp")));
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(feature = "export")]
pub mod xlsx;
#[cfg(feature = "export")]
pub mod pdf;
#[cfg(feature = "export")]
pub mod pdf_labels;
#[cfg(feature = "export")]
pub mod pdf_quotation;
#[cfg(feature = "export")]
mod pdf_document;
