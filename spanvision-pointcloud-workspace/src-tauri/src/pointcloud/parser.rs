use std::fs::File;
use std::io::{Cursor, Read, Seek, SeekFrom};
use std::path::Path;
use memmap2::Mmap;

use super::types::{BoundingBox3D, PointRecord, PointcloudMetadata};

/// LAS file header (simplified for 1.2-1.4)
#[derive(Debug)]
struct LasHeader {
    version_major: u8,
    version_minor: u8,
    header_size: u16,
    point_data_format: u8,
    point_data_record_length: u16,
    number_of_points: u64,
    offset_to_points: u32,
    scale: [f64; 3],
    offset: [f64; 3],
    min: [f64; 3],
    max: [f64; 3],
    has_color: bool,
    has_gps_time: bool,
}

/// Parse a LAS file header from memory-mapped data
fn parse_las_header(data: &[u8]) -> Result<LasHeader, String> {
    if data.len() < 227 {
        return Err("File too small for LAS header".into());
    }

    // Check signature "LASF"
    if &data[0..4] != b"LASF" {
        return Err("Not a LAS file (invalid signature)".into());
    }

    let version_major = data[24];
    let version_minor = data[25];

    if version_major != 1 || version_minor > 4 {
        return Err(format!("Unsupported LAS version {}.{}", version_major, version_minor));
    }

    let offset_to_points = u32::from_le_bytes([data[96], data[97], data[98], data[99]]);
    let header_size = u16::from_le_bytes([data[94], data[95]]);
    let minimum_header = match version_minor { 4 => 375, 3 => 235, _ => 227 };
    if usize::from(header_size) < minimum_header || usize::from(header_size) > data.len()
        || offset_to_points < u32::from(header_size) || offset_to_points as usize > data.len() {
        return Err("Invalid or truncated LAS header offsets".into());
    }
    // LAZ uses the high bits for compression flags; the record format is six bits.
    let point_data_format = data[104] & 0x3f;
    let point_data_record_length = u16::from_le_bytes([data[105], data[106]]);
    let minimum_records = [20u16, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];
    let maximum_format = match version_minor { 4 => 10, 3 => 5, 2 => 3, _ => 1 };
    if usize::from(point_data_format) > maximum_format || point_data_record_length < minimum_records[usize::from(point_data_format)] {
        return Err("Unsupported LAS point format or invalid record length".into());
    }

    // Point count: LAS 1.4 uses 64-bit at offset 247, older uses 32-bit at offset 107
    let legacy_count = u32::from_le_bytes([data[107], data[108], data[109], data[110]]) as u64;
    let number_of_points = if version_minor == 4 {
        let extended_count = u64::from_le_bytes([
            data[247], data[248], data[249], data[250],
            data[251], data[252], data[253], data[254],
        ]);
        if extended_count > 0 { extended_count } else { legacy_count }
    } else {
        legacy_count
    };
    // The current octree owns all decoded points; bound this allocation explicitly.
    if number_of_points == 0 || number_of_points > 50_000_000 {
        return Err("LAS/LAZ point count must be between 1 and 50,000,000 for this desktop engine".into());
    }
    if data[104] & 0xc0 == 0 {
        let end = u64::from(offset_to_points) + number_of_points * u64::from(point_data_record_length);
        if end > data.len() as u64 { return Err("Truncated LAS point data".into()); }
    }

    let read_f64 = |off: usize| -> f64 {
        f64::from_le_bytes([
            data[off], data[off + 1], data[off + 2], data[off + 3],
            data[off + 4], data[off + 5], data[off + 6], data[off + 7],
        ])
    };

    let scale = [read_f64(131), read_f64(139), read_f64(147)];
    let offset = [read_f64(155), read_f64(163), read_f64(171)];
    if scale.iter().any(|value| !value.is_finite() || *value <= 0.0) || offset.iter().any(|value| !value.is_finite()) {
        return Err("Invalid LAS scale or coordinate offset".into());
    }
    let max_x = read_f64(179);
    let min_x = read_f64(187);
    let max_y = read_f64(195);
    let min_y = read_f64(203);
    let max_z = read_f64(211);
    let min_z = read_f64(219);
    if [min_x, min_y, min_z, max_x, max_y, max_z].iter().any(|value| !value.is_finite())
        || min_x > max_x || min_y > max_y || min_z > max_z {
        return Err("Invalid LAS coordinate bounds".into());
    }

    // Point formats with RGB: 2, 3, 5, 7, 8, 10
    let has_color = matches!(point_data_format, 2 | 3 | 5 | 7 | 8 | 10);
    let has_gps_time = matches!(point_data_format, 1 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);

    Ok(LasHeader {
        version_major,
        version_minor,
        header_size,
        point_data_format,
        point_data_record_length,
        number_of_points,
        offset_to_points,
        scale,
        offset,
        min: [min_x, min_y, min_z],
        max: [max_x, max_y, max_z],
        has_color,
        has_gps_time,
    })
}

/// Memory-mapped LAS/LAZ parser
pub struct PointcloudParser {
    mmap: Mmap,
    header: LasHeader,
    is_laz: bool,
}

impl PointcloudParser {
    /// Open a LAS or LAZ file using memory-mapped I/O
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let path = path.as_ref();
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
        let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("Failed to mmap file: {}", e))?;

        let header = parse_las_header(&mmap)?;
        let is_laz = mmap[104] & 0xc0 != 0;
        if ext == "laz" && !is_laz { return Err("The .laz file contains uncompressed LAS data; use the .las extension".into()); }

        Ok(Self { mmap, header, is_laz })
    }

    /// Get metadata from the parsed header
    pub fn metadata(&self, id: &str, file_path: &str) -> PointcloudMetadata {
        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        PointcloudMetadata {
            id: id.to_string(),
            file_path: file_path.to_string(),
            file_name,
            format: if self.is_laz { "LAZ".into() } else { "LAS".into() },
            total_points: self.header.number_of_points,
            bounds: BoundingBox3D {
                min_x: self.header.min[0],
                min_y: self.header.min[1],
                min_z: self.header.min[2],
                max_x: self.header.max[0],
                max_y: self.header.max[1],
                max_z: self.header.max[2],
            },
            has_color: self.header.has_color,
            has_intensity: true,
            has_classification: true,
            point_record_format: self.header.point_data_format,
            las_version: format!("{}.{}", self.header.version_major, self.header.version_minor),
        }
    }

    pub fn total_points(&self) -> u64 {
        self.header.number_of_points
    }

    pub fn bounds(&self) -> BoundingBox3D {
        BoundingBox3D {
            min_x: self.header.min[0],
            min_y: self.header.min[1],
            min_z: self.header.min[2],
            max_x: self.header.max[0],
            max_y: self.header.max[1],
            max_z: self.header.max[2],
        }
    }

    /// Read a range of points from an uncompressed LAS file.
    pub fn read_points(&self, start_index: u64, count: u64) -> Result<Vec<PointRecord>, String> {
        if self.is_laz { return Err("Compressed LAZ points must be read with the decompression stream".into()); }
        let record_len = self.header.point_data_record_length as u64;
        let data_start = self.header.offset_to_points as u64;
        let total = self.header.number_of_points;

        let actual_count = count.min(total.saturating_sub(start_index));
        let mut points = Vec::with_capacity(actual_count as usize);

        let scale = &self.header.scale;
        let offset = &self.header.offset;
        let format = self.header.point_data_format;
        let has_color = self.header.has_color;

        // Color byte offset depends on point format
        let color_offset = Self::color_byte_offset(format);

        for i in 0..actual_count {
            let byte_offset = data_start + (start_index + i) * record_len;
            let end = byte_offset + record_len;

            if end as usize > self.mmap.len() {
                break;
            }

            let rec = &self.mmap[byte_offset as usize..end as usize];

            // X, Y, Z as i32 scaled
            let xi = i32::from_le_bytes([rec[0], rec[1], rec[2], rec[3]]);
            let yi = i32::from_le_bytes([rec[4], rec[5], rec[6], rec[7]]);
            let zi = i32::from_le_bytes([rec[8], rec[9], rec[10], rec[11]]);

            let x = xi as f64 * scale[0] + offset[0];
            let y = yi as f64 * scale[1] + offset[1];
            let z = zi as f64 * scale[2] + offset[2];
            if ![x, y, z].iter().all(|value| value.is_finite()) { return Err("LAS contains non-finite point coordinates".into()); }

            let intensity = u16::from_le_bytes([rec[12], rec[13]]);

            // Classification depends on format
            let classification = if format >= 6 {
                rec[16] // Point Data Record Format 6+
            } else {
                if self.header.version_minor > 0 { rec[15] & 0x1f } else { rec[15] }
            };

            let (r, g, b) = if has_color && color_offset > 0 {
                let co = color_offset;
                if co + 5 < rec.len() {
                    let r16 = u16::from_le_bytes([rec[co], rec[co + 1]]);
                    let g16 = u16::from_le_bytes([rec[co + 2], rec[co + 3]]);
                    let b16 = u16::from_le_bytes([rec[co + 4], rec[co + 5]]);
                    // LAS stores 16-bit color, scale to 8-bit
                    ((r16 >> 8) as u8, (g16 >> 8) as u8, (b16 >> 8) as u8)
                } else {
                    (128, 128, 128)
                }
            } else {
                (128, 128, 128)
            };

            points.push(PointRecord {
                x, y, z, r, g, b, intensity, classification,
            });
        }

        Ok(points)
    }

    /// Get byte offset to RGB color within a point record
    fn color_byte_offset(format: u8) -> usize {
        match format {
            2 => 20,     // Format 2: XYZ(12) + Intensity(2) + Flags(4) + Classification(1) + ...
            3 => 28,     // Format 3: like 2 but with GPS time (8 bytes)
            5 => 28,     // Format 5: like 3
            7 => 30,     // Format 7: XYZ(12) + Intensity(2) + ReturnInfo(2) + Flags(2) + Classification(1) + ... + GPSTime(8)
            8 => 30,     // Format 8: like 7 + NIR
            10 => 30,    // Format 10: like 8 + waveform
            _ => 0,      // No color
        }
    }

    /// Find the LASzip VLR in the file header and return its data
    fn find_laszip_vlr(&self) -> Result<Vec<u8>, String> {
        let data = &self.mmap[..];
        let header_size = self.header.offset_to_points as usize;

        // LAS 1.4 has a 375-byte public header; the declared size also permits extensions.
        let vlr_start = usize::from(self.header.header_size);
        let num_vlrs = u32::from_le_bytes([data[100], data[101], data[102], data[103]]) as usize;

        let mut offset = vlr_start;
        for _ in 0..num_vlrs {
            if offset + 54 > header_size { break; }

            // VLR header: reserved(2) + user_id(16) + record_id(2) + record_length(2) + description(32)
            let user_id = &data[offset + 2..offset + 18];
            let record_id = u16::from_le_bytes([data[offset + 18], data[offset + 19]]);
            let record_length = u16::from_le_bytes([data[offset + 20], data[offset + 21]]) as usize;

            let vlr_data_start = offset + 54;
            let vlr_data_end = vlr_data_start + record_length;

            // LASzip VLR: user_id starts with "laszip encoded", record_id = 22204
            if record_id == 22204 && user_id.starts_with(b"laszip encoded") {
                if vlr_data_end <= header_size {
                    return Ok(data[vlr_data_start..vlr_data_end].to_vec());
                }
            }

            offset = vlr_data_end;
        }

        Err("LASzip VLR not found in LAZ file".into())
    }

    /// Decompress and read all points from a LAZ file using the laz crate.
    fn read_laz_all_points(&self) -> Result<Vec<PointRecord>, String> {
        let vlr_data = self.find_laszip_vlr()?;
        let vlr = laz::LazVlr::from_buffer(&vlr_data)
            .map_err(|e| format!("Failed to parse LASzip VLR: {}", e))?;

        let compressed_data = &self.mmap[..];
        let mut cursor = Cursor::new(compressed_data);
        cursor.seek(SeekFrom::Start(self.header.offset_to_points as u64))
            .map_err(|e| format!("Failed to seek to point data: {}", e))?;

        let mut decompressor = laz::LasZipDecompressor::new(cursor, vlr)
            .map_err(|e| format!("Failed to create LAZ decompressor: {}", e))?;

        self.decompress_laz_points(&mut decompressor)
    }

    /// Decompress LAZ points using the laz crate decompressor
    fn decompress_laz_points<R: Read + Seek + Send>(
        &self,
        decompressor: &mut laz::LasZipDecompressor<'_, R>,
    ) -> Result<Vec<PointRecord>, String> {
        let total = self.header.number_of_points as usize;
        let record_len = self.header.point_data_record_length as usize;
        let scale = &self.header.scale;
        let offset = &self.header.offset;
        let format = self.header.point_data_format;
        let has_color = self.header.has_color;
        let color_offset = Self::color_byte_offset(format);

        let mut points = Vec::with_capacity(total);
        let mut record_buf = vec![0u8; record_len];

        for _ in 0..total {
            decompressor.decompress_one(&mut record_buf)
                .map_err(|e| format!("LAZ decompression error: {}", e))?;

            let rec = &record_buf;

            let xi = i32::from_le_bytes([rec[0], rec[1], rec[2], rec[3]]);
            let yi = i32::from_le_bytes([rec[4], rec[5], rec[6], rec[7]]);
            let zi = i32::from_le_bytes([rec[8], rec[9], rec[10], rec[11]]);

            let x = xi as f64 * scale[0] + offset[0];
            let y = yi as f64 * scale[1] + offset[1];
            let z = zi as f64 * scale[2] + offset[2];

            let intensity = u16::from_le_bytes([rec[12], rec[13]]);
            if ![x, y, z].iter().all(|value| value.is_finite()) { return Err("LAZ contains non-finite point coordinates".into()); }

            let classification = if format >= 6 {
                rec[16]
            } else {
                if self.header.version_minor > 0 { rec[15] & 0x1f } else { rec[15] }
            };

            let (r, g, b) = if has_color && color_offset > 0 && color_offset + 5 < rec.len() {
                let co = color_offset;
                let r16 = u16::from_le_bytes([rec[co], rec[co + 1]]);
                let g16 = u16::from_le_bytes([rec[co + 2], rec[co + 3]]);
                let b16 = u16::from_le_bytes([rec[co + 4], rec[co + 5]]);
                ((r16 >> 8) as u8, (g16 >> 8) as u8, (b16 >> 8) as u8)
            } else {
                (128, 128, 128)
            };

            points.push(PointRecord {
                x, y, z, r, g, b, intensity, classification,
            });
        }

        Ok(points)
    }

    /// Streaming iterator over all points - works for both LAS and LAZ.
    /// Calls the callback for each batch of points.
    pub fn stream_points<F>(&self, batch_size: u64, mut callback: F) -> Result<(), String>
    where
        F: FnMut(&[PointRecord], u64) -> bool, // return false to stop
    {
        if batch_size == 0 { return Err("Point batch size must be greater than zero".into()); }
        if self.is_laz {
            // For LAZ: decompress all points, then deliver in batches
            let all_points = self.read_laz_all_points()?;
            let total = all_points.len() as u64;
            let mut offset = 0u64;

            while offset < total {
                let end = (offset + batch_size).min(total) as usize;
                let batch = &all_points[offset as usize..end];
                if !callback(batch, offset) {
                    break;
                }
                offset = end as u64;
            }

            return Ok(());
        }

        // For uncompressed LAS: read in batches from memory-mapped file
        let total = self.header.number_of_points;
        let mut offset = 0u64;

        while offset < total {
            let count = batch_size.min(total - offset);
            let points = self.read_points(offset, count)?;
            let read_count = points.len() as u64;

            if !callback(&points, offset) {
                break;
            }

            offset += read_count;
            if read_count == 0 {
                break;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod compressed_color_tests {
    use super::*;
    #[test]
    fn compressed_laz_preserves_rgb_classification_and_format() {
        let file=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/rgb-classified.laz");
        let parser=PointcloudParser::open(&file).unwrap();
        let metadata=parser.metadata("test",file.to_str().unwrap());
        assert_eq!(metadata.point_record_format,2);assert!(metadata.has_color);
        let points=parser.read_laz_all_points().unwrap();
        assert_eq!(points.len(),64);assert_eq!(points[0].r,160);assert_eq!(points[0].g,100);assert_eq!(points[0].b,70);
        assert_eq!(points[0].classification,2);assert_eq!(points[1].classification,6);
    }
    fn las_fixture() -> Vec<u8> {
        std::fs::read(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/rgb-classified.las")).unwrap()
    }
    #[test]
    fn header_rejects_truncation_bad_record_lengths_scales_counts_and_offsets() {
        let original = las_fixture();
        assert!(parse_las_header(&original[..20]).unwrap_err().contains("header"));
        assert!(parse_las_header(&original[..original.len()-1]).unwrap_err().contains("Truncated LAS point"));
        let mut bad = original.clone(); bad[105..107].copy_from_slice(&1u16.to_le_bytes());
        assert!(parse_las_header(&bad).unwrap_err().contains("record length"));
        let mut bad = original.clone(); bad[131..139].copy_from_slice(&f64::NAN.to_le_bytes());
        assert!(parse_las_header(&bad).unwrap_err().contains("scale"));
        let mut bad = original.clone(); bad[107..111].copy_from_slice(&50_000_001u32.to_le_bytes());
        assert!(parse_las_header(&bad).unwrap_err().contains("50,000,000"));
        let mut bad = original.clone(); bad[96..100].copy_from_slice(&1u32.to_le_bytes());
        assert!(parse_las_header(&bad).unwrap_err().contains("offsets"));
    }
    #[test]
    fn las14_uses_extended_count_and_declared_375_byte_header() {
        let original = las_fixture();
        let mut data = vec![0u8; original.len()+148];
        data[..227].copy_from_slice(&original[..227]);
        data[375..].copy_from_slice(&original[227..]);
        data[25]=4;
        data[94..96].copy_from_slice(&375u16.to_le_bytes());
        data[96..100].copy_from_slice(&375u32.to_le_bytes());
        data[107..111].copy_from_slice(&1u32.to_le_bytes());
        data[247..255].copy_from_slice(&64u64.to_le_bytes());
        let header=parse_las_header(&data).unwrap();
        assert_eq!(header.number_of_points,64);
        assert_eq!(header.header_size,375);
    }
    #[test]
    fn zero_batch_is_rejected_without_starting_an_infinite_stream() {
        let file=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/rgb-classified.las");
        let parser=PointcloudParser::open(&file).unwrap();
        assert!(parser.stream_points(0,|_,_|true).unwrap_err().contains("greater than zero"));
    }
}
