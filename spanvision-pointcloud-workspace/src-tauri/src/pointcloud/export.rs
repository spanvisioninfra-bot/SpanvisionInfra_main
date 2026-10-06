use std::io::{BufWriter, Read, Write};
use std::path::Path;
use super::parser::PointcloudParser;
use super::types::PointRecord;

/// Move a complete, bounded native source into the editable frontend path.
/// Large native sources retain octree viewing and full-source export.
pub fn read_editable_source(source: &Path, total_points: u64) -> Result<Vec<u8>, String> {
    if total_points > 1_000_000 {
        return Err("Editing and reconstruction support complete clouds up to 1,000,000 points. Export or split this cloud into smaller files first.".into());
    }
    const LIMIT: u64 = 128 * 1024 * 1024;
    let file = std::fs::File::open(source).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > LIMIT {
        return Err("The editable source must be 128 MB or smaller".into());
    }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT { return Err("The editable source exceeded 128 MB while reading".into()); }
    Ok(bytes)
}

/// Export every native source point, independently of the displayed octree budget.
/// The completed file atomically replaces the destination; failed writes keep its old contents.
pub fn export_pointcloud(source: &Path, destination: &Path, format: &str) -> Result<u64, String> {
    if !["ply-binary", "ply-ascii", "xyz", "pts", "csv"].contains(&format) {
        return Err("Unsupported native pointcloud export format".into());
    }
    let source_path = source.canonicalize().map_err(|e| e.to_string())?;
    if destination.exists() && destination.canonicalize().map_err(|e| e.to_string())? == source_path {
        return Err("Choose another destination; export cannot replace its source file".into());
    }
    let parser = PointcloudParser::open(source)?;
    let expected = parser.total_points();
    let directory = destination.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    {
        let mut writer = BufWriter::new(temporary.as_file_mut());
        if format.starts_with("ply-") {
            let encoding = if format == "ply-binary" { "binary_little_endian" } else { "ascii" };
            write!(writer, "ply\nformat {} 1.0\ncomment Exported from Spanvision Infra Pointcloud Workspace\nelement vertex {}\nproperty double x\nproperty double y\nproperty double z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nproperty float intensity\nproperty uchar classification\nend_header\n", encoding, expected).map_err(|e| e.to_string())?;
        } else if format == "pts" {
            writeln!(writer, "{}", expected).map_err(|e| e.to_string())?;
        } else if format == "csv" {
            writeln!(writer, "x,y,z,r,g,b,intensity,classification").map_err(|e| e.to_string())?;
        }
        let mut written = 0u64;
        let mut failure = None;
        parser.stream_points(65_536, |points, _| {
            for point in points {
                if let Err(error) = write_point(&mut writer, point, format) {
                    failure = Some(error.to_string()); return false;
                }
                written += 1;
            }
            true
        })?;
        if let Some(error) = failure { return Err(error); }
        if written != expected { return Err("Export stopped before all source points were written".into()); }
        writer.flush().map_err(|e| e.to_string())?;
    }
    temporary.as_file_mut().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(destination).map_err(|e| e.error.to_string())?;
    Ok(expected)
}

fn write_point(writer: &mut impl Write, point: &PointRecord, format: &str) -> std::io::Result<()> {
    let p = point;
    let intensity = f32::from(p.intensity) / 65535.0;
    match format {
        "ply-binary" => {
            writer.write_all(&p.x.to_le_bytes())?; writer.write_all(&p.y.to_le_bytes())?; writer.write_all(&p.z.to_le_bytes())?;
            writer.write_all(&[p.r, p.g, p.b])?; writer.write_all(&intensity.to_le_bytes())?; writer.write_all(&[p.classification])
        }
        "ply-ascii" => writeln!(writer, "{} {} {} {} {} {} {} {}", p.x, p.y, p.z, p.r, p.g, p.b, intensity, p.classification),
        "xyz" => writeln!(writer, "{} {} {} {} {} {}", p.x, p.y, p.z, p.r, p.g, p.b),
        "pts" => {
            let signed_intensity = ((intensity * 4096.0).round() as i32 - 2048).clamp(-2048, 2047);
            writeln!(writer, "{} {} {} {} {} {} {}", p.x, p.y, p.z, signed_intensity, p.r, p.g, p.b)
        }
        "csv" => writeln!(writer, "{},{},{},{},{},{},{},{}", p.x, p.y, p.z, p.r, p.g, p.b, intensity, p.classification),
        _ => unreachable!("validated format"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editable_sources_keep_complete_original_bytes_and_reject_display_only_subsets() {
        for extension in ["las", "laz"] {
            let source = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../tests/fixtures/rgb-classified.{}", extension));
            assert_eq!(read_editable_source(&source, 64).unwrap(), std::fs::read(&source).unwrap());
            assert!(read_editable_source(&source, 1_000_001).unwrap_err().contains("1,000,000"));
        }
    }
    #[test]
    fn actual_las_and_laz_exports_preserve_source_coordinates_and_attributes() {
        let directory = tempfile::tempdir().unwrap();
        for extension in ["las", "laz"] {
            let source = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../tests/fixtures/rgb-classified.{}", extension));
            for format in ["ply-ascii", "ply-binary", "xyz", "pts", "csv"] {
                let output = directory.path().join(format!("{}-{}", extension, format));
                assert_eq!(export_pointcloud(&source, &output, format).unwrap(), 64);
                let bytes = std::fs::read(output).unwrap();
                if format == "ply-binary" {
                    let end = bytes.windows(11).position(|b| b == b"end_header\n").unwrap()+11;
                    assert_eq!(bytes.len()-end,64*32);
                    assert_eq!(f64::from_le_bytes(bytes[end..end+8].try_into().unwrap()),100000.0);
                    assert_eq!(&bytes[end+24..end+27],&[160,100,70]);
                    assert_eq!(bytes[end+31],2);
                } else {
                    let text=String::from_utf8(bytes).unwrap();
                    let rows = if format == "ply-ascii" { text.split("end_header\n").nth(1).unwrap() }
                        else if ["pts","csv"].contains(&format) { text.split_once('\n').unwrap().1 } else { &text };
                    assert_eq!(rows.lines().count(),64);
                    let first=rows.lines().next().unwrap().replace(','," ");
                    let values:Vec<_>=first.split_whitespace().collect();
                    assert_eq!(values[0].parse::<f64>().unwrap(),100000.0);
                    if format == "csv" || format == "ply-ascii" { assert_eq!(values[7],"2"); }
                }
            }
        }
    }
    #[test]
    fn exports_replace_completed_outputs_and_preserve_source_or_failed_destinations() {
        let directory=tempfile::tempdir().unwrap();
        let source=directory.path().join("source.las");
        let fixture=Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/rgb-classified.las");
        std::fs::copy(fixture,&source).unwrap();
        let before=std::fs::read(&source).unwrap();
        assert!(export_pointcloud(&source,&source,"csv").unwrap_err().contains("source file"));
        assert_eq!(std::fs::read(&source).unwrap(),before);
        let output=directory.path().join("output.csv");
        std::fs::write(&output,b"previous successful output").unwrap();
        assert!(export_pointcloud(&source,&output,"unknown").is_err());
        assert_eq!(std::fs::read(&output).unwrap(),b"previous successful output");
        assert_eq!(export_pointcloud(&source,&output,"csv").unwrap(),64);
        assert!(std::fs::read_to_string(output).unwrap().starts_with("x,y,z,"));
    }
}
