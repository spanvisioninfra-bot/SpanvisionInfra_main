# Open-source provenance

Frame Vision Studio is a modified distribution of Open Frame Studio by the OpenAEC Foundation.

Original project: https://github.com/OpenAEC-Foundation/Open-Frame-Studio

Changes made for Spanvision infra on 2026-10-02: product identity and icons, a Spanvision Mono theme, accessible interface states, responsive layouts, companion-page styling, and generated-document display branding. The original engineering model, file format and workflows are retained.

The supplied upstream `LICENSE` contains Creative Commons Attribution-ShareAlike 4.0 International terms. The supplied Rust workspace declares AGPL-3.0 in `Cargo.toml`. Both upstream notices are retained; these modifications do not assert exclusive ownership of the upstream work or affiliation with its original authors. See `LICENSE`, `Cargo.toml`, and the original README in `docs/upstream/README.md`.

Bundled typefaces retain their original names. Upstream copyright and licensing notices remain applicable.

Document export changes on 2026-10-05 include shared browser/native PDF and XLSX generators, pagination, measured Unicode text, production sections, actual piece labels and safe file replacement. PDF documents embed the unmodified Inter Regular and Bold typefaces under SIL Open Font License 1.1; see `ofs-core/assets/fonts/Inter-OFL.txt` and the public `Inter-OFL.txt`. PDF font parsing uses ttf-parser 0.25 (MIT/Apache-2.0); PDF serialization uses printpdf 0.9 (MIT); Excel serialization uses rust_xlsxwriter 0.94 (MIT/Apache-2.0).
