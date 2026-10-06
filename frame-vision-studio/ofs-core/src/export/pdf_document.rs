//! Shared, measured and paginated document layout for browser and desktop PDFs.
use std::collections::BTreeMap;
use printpdf::*;

const REGULAR: &[u8] = include_bytes!("../../assets/fonts/Inter-Regular.ttf");
const BOLD: &[u8] = include_bytes!("../../assets/fonts/Inter-Bold.ttf");
pub const INK: (f32, f32, f32) = (0.10, 0.13, 0.17);
pub const MUTED: (f32, f32, f32) = (0.38, 0.43, 0.49);
const WHITE: (f32, f32, f32) = (1.0, 1.0, 1.0);

pub fn color(c: (f32, f32, f32)) -> Color {
    Color::Rgb(Rgb { r: c.0, g: c.1, b: c.2, icc_profile: None })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn supports_extended_latin_greek_and_cyrillic_and_rejects_missing_glyphs() {
        let mut pdf = Report::new("Unicode text",210.0,297.0,15.0).unwrap();
        pdf.paragraph("Café façade - Ελληνικά - Кириллица",10.0,false);
        assert!(pdf.finish().unwrap().starts_with(b"%PDF-"));
        let mut pdf = Report::new("Missing font coverage",210.0,297.0,15.0).unwrap();
        pdf.paragraph("Unsupported: \u{1f600}",10.0,false);
        assert!(pdf.finish().unwrap_err().contains("U+1F600"));
    }
}

fn parse_font(bytes: &[u8], name: &str) -> Result<ParsedFont, String> {
    // printpdf's no-HTML build deliberately does not parse TTF tables. Supply
    // the actual Unicode cmap and advances instead of its empty stub metrics.
    let face = ttf_parser::Face::parse(bytes, 0).map_err(|e| format!("Cannot load report font: {e:?}"))?;
    let mut cmap = BTreeMap::new();
    let mut widths = BTreeMap::new();
    if let Some(table) = face.tables().cmap {
        for subtable in table.subtables {
            if !subtable.is_unicode() { continue; }
            subtable.codepoints(|cp| {
                if let Some(gid) = face.glyph_index(char::from_u32(cp).unwrap_or('\u{fffd}')) {
                    cmap.insert(cp, gid.0);
                    widths.insert(gid.0, face.glyph_hor_advance(gid).unwrap_or(0));
                }
            });
        }
    }
    let mut parsed = ParsedFont::with_glyph_data(bytes.to_vec(), 0, Some(name.into()), cmap,
        widths, face.units_per_em(), FontMetrics { ascent: face.ascender(), descent: face.descender() });
    let bounds = face.global_bounding_box();
    parsed.pdf_font_metrics = printpdf::font::PdfFontMetricsStub {
        units_per_em: face.units_per_em(), x_min: bounds.x_min, y_min: bounds.y_min,
        x_max: bounds.x_max, y_max: bounds.y_max,
    };
    Ok(parsed)
}

pub struct Report {
    pub doc: PdfDocument,
    pub ops: Vec<Op>,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub margin: f32,
    title: String,
    fonts: [PdfFontHandle; 2],
    metrics: [ParsedFont; 2],
    error: Option<String>,
}

impl Report {
    pub fn new(title: &str, width: f32, height: f32, margin: f32) -> Result<Self, String> {
        if title.chars().count() > 500 { return Err("The PDF heading is too long.".into()); }
        let mut doc = PdfDocument::new(title);
        let metrics = [parse_font(REGULAR, "Inter-Regular")?, parse_font(BOLD, "Inter-Bold")?];
        let fonts = [PdfFontHandle::External(doc.add_font(&metrics[0])),
            PdfFontHandle::External(doc.add_font(&metrics[1]))];
        let mut report = Self { doc, ops: Vec::new(), y: height - margin, width, height, margin,
            title: title.into(), fonts, metrics, error: None };
        report.page_header();
        Ok(report)
    }

    fn page_header(&mut self) {
        self.y = self.height - self.margin;
        let title = self.title.clone();
        self.paragraph(&title, 15.0, true);
        self.y -= 3.0;
    }

    pub fn finish_page(&mut self) {
        let page = self.doc.pages.len() + 1;
        self.text(&format!("Spanvision Infra | Frame Vision Studio | Page {page}"), 7.0,
            self.margin, 7.0, false, MUTED);
        self.doc.pages.push(PdfPage::new(Mm(self.width), Mm(self.height), std::mem::take(&mut self.ops)));
    }

    pub fn new_page(&mut self) { self.finish_page(); self.page_header(); }

    pub fn ensure(&mut self, space: f32) {
        if self.y - space < self.margin { self.new_page(); }
    }

    pub fn text(&mut self, value: &str, size: f32, x: f32, y: f32, bold: bool, c: (f32, f32, f32)) {
        let value = value.replace(['\r', '\n', '\t'], " ");
        let f = usize::from(bold);
        for ch in value.chars() {
            if self.metrics[f].lookup_glyph_index(ch as u32).is_none() && self.error.is_none() {
                self.error = Some(format!("The report font cannot render character U+{:04X}. Use supported text before exporting the PDF.", ch as u32));
            }
        }
        self.ops.extend([
            Op::SetFillColor { col: color(c) }, Op::StartTextSection,
            Op::SetFont { font: self.fonts[f].clone(), size: Pt(size) },
            Op::SetTextCursor { pos: Point { x: Mm(x).into(), y: Mm(y).into() } },
            Op::ShowText { items: vec![TextItem::Text(value)] }, Op::EndTextSection,
        ]);
    }

    fn char_width(&self, ch: char, size: f32, bold: bool) -> f32 {
        let font = &self.metrics[usize::from(bold)];
        let units = font.lookup_glyph_index(ch as u32).and_then(|gid| font.get_glyph_width(gid)).unwrap_or(font.units_per_em);
        units as f32 / font.units_per_em as f32 * size * 25.4 / 72.0
    }

    pub fn wrap(&self, value: &str, size: f32, width: f32, bold: bool) -> Vec<String> {
        let mut lines = Vec::new();
        for paragraph in value.replace('\r', "").split('\n') {
            let mut line = String::new();
            let mut used = 0.0;
            for ch in paragraph.chars() {
                let ch = if ch == '\t' { ' ' } else { ch };
                let advance = self.char_width(ch, size, bold);
                while !line.is_empty() && used + advance > width {
                    // Break at the last space where possible, keeping every
                    // character of long identifiers without UTF-8 byte slices.
                    if let Some(index) = line.rfind(' ').filter(|i| *i > 0) {
                        let tail = line.split_off(index + 1);
                        lines.push(line.trim_end().to_string());
                        line = tail;
                        used = line.chars().map(|c| self.char_width(c, size, bold)).sum();
                    } else { lines.push(std::mem::take(&mut line)); used = 0.0; }
                }
                line.push(ch); used += advance;
            }
            lines.push(line);
        }
        lines
    }

    pub fn paragraph(&mut self, value: &str, size: f32, bold: bool) {
        let lh = size * 25.4 / 72.0 * 1.35;
        for line in self.wrap(value, size, self.width - 2.0 * self.margin, bold) {
            self.ensure(lh);
            self.text(&line, size, self.margin, self.y, bold, INK);
            self.y -= lh;
        }
    }

    pub fn rect(&mut self, x: f32, y: f32, width: f32, height: f32, c: (f32, f32, f32)) {
        self.ops.extend([Op::SetFillColor { col: color(c) }, Op::DrawPolygon { polygon: Polygon {
            rings: vec![PolygonRing { points: [(x,y),(x+width,y),(x+width,y+height),(x,y+height)].iter()
                .map(|&(x,y)| LinePoint { p: Point { x: Mm(x).into(), y: Mm(y).into() }, bezier: false }).collect() }],
            mode: PaintMode::Fill, winding_order: WindingOrder::NonZero,
        }}]);
    }

    pub fn line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, thickness: f32) {
        self.ops.extend([Op::SetOutlineColor { col: color(INK) }, Op::SetOutlineThickness { pt: Pt(thickness) },
            Op::DrawLine { line: Line { points: [(x1,y1),(x2,y2)].iter().map(|&(x,y)| LinePoint {
                p: Point { x: Mm(x).into(), y: Mm(y).into() }, bezier: false }).collect(), is_closed: false } }]);
    }

    fn table_header(&mut self, heading: &str, headers: &[&str], widths: &[f32]) {
        self.paragraph(heading, 11.0, true);
        self.y -= 2.0;
        let lines: Vec<_> = headers.iter().zip(widths).map(|(h,w)| self.wrap(h, 7.0, w - 2.0, true)).collect();
        let height = lines.iter().map(Vec::len).max().unwrap_or(1) as f32 * 3.5 + 2.0;
        self.rect(self.margin, self.y - height, widths.iter().sum(), height, INK);
        let mut x = self.margin;
        for (column, width) in lines.iter().zip(widths) {
            for (i,line) in column.iter().enumerate() {
                self.text(line, 7.0, x + 1.0, self.y - 3.5 - i as f32 * 3.5, true, WHITE);
            }
            x += width;
        }
        self.y -= height;
    }

    pub fn table(&mut self, heading: &str, headers: &[&str], widths: &[f32], rows: &[Vec<String>]) {
        if rows.is_empty() { return; }
        self.ensure(28.0);
        self.table_header(heading, headers, widths);
        for (ri, row) in rows.iter().enumerate() {
            let columns: Vec<_> = row.iter().zip(widths).map(|(v,w)| self.wrap(v, 7.0, w - 2.0, false)).collect();
            let count = columns.iter().map(Vec::len).max().unwrap_or(1);
            let mut offset = 0;
            while offset < count {
                if self.y - 5.5 < self.margin {
                    self.new_page(); self.table_header(&format!("{heading} (continued)"), headers, widths);
                }
                let available = ((self.y - self.margin - 2.0) / 3.5).floor().max(1.0) as usize;
                let chunk = (count - offset).min(available);
                let height = chunk as f32 * 3.5 + 2.0;
                if ri % 2 == 0 { self.rect(self.margin, self.y - height, widths.iter().sum(), height, (0.95,0.96,0.97)); }
                let mut x = self.margin;
                for (column, width) in columns.iter().zip(widths) {
                    for (i, line) in column.iter().skip(offset).take(chunk).enumerate() {
                        self.text(line, 7.0, x + 1.0, self.y - 3.5 - i as f32 * 3.5, false, INK);
                    }
                    x += width;
                }
                self.y -= height; offset += chunk;
            }
        }
        self.y -= 6.0;
    }

    pub fn finish(mut self) -> Result<Vec<u8>, String> {
        if let Some(error) = self.error { return Err(error); }
        self.finish_page();
        if self.doc.pages.len() > 5000 { return Err("PDF export exceeds 5,000 pages. Export smaller batches.".into()); }
        Ok(self.doc.save(&PdfSaveOptions::default(), &mut Vec::new()))
    }
}
