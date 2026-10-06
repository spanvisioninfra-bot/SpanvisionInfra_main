"""Independently inspect PDF Studio's downloaded browser regression fixture."""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("qa/readiness/pdf-documents")
    downloaded = folder / "annotated.pdf"
    reader = PdfReader(downloaded)
    assert len(reader.pages) == 2, "Both source pages must survive Save As"
    expected = ["Spanvision PDF round trip", "Rotated second page"]
    for page, text in zip(reader.pages, expected):
        assert text in page.extract_text(), f"Missing source text: {text}"
    assert reader.pages[1].rotation == 90, "Second page rotation must survive"
    annotations = reader.pages[0]["/Annots"]
    assert len(annotations) == 1, "Expected the actual mouse-drawn rectangle"
    annotation = annotations[0].get_object()
    assert annotation["/Subtype"] == "/Square"
    left, bottom, right, top = map(float, annotation["/Rect"])
    assert 0 <= left < right <= 400 and 0 <= bottom < top <= 300
    assert "/N" in annotation["/AP"], "Rectangle needs a saved normal appearance"
    with pdfplumber.open(downloaded) as document:
        for page in document.pages:
            for char in page.chars:
                assert -0.5 <= char["x0"] <= char["x1"] <= page.width + 0.5
                assert -0.5 <= char["top"] <= char["bottom"] <= page.height + 0.5
    checks = ["Two pages and original text retained", "90-degree page rotation retained",
              "Bounded rectangle with normal appearance retained", "Text character bounds fit both pages"]
    renderer = shutil.which("pdftoppm")
    if renderer:
        subprocess.run([renderer, "-png", "-r", "110", str(downloaded), str(folder / "annotated")], check=True)
        checks.append("Both pages rendered by Poppler; visual review required separately")
    result = {"passed": True, "checkedAt": datetime.now(timezone.utc).isoformat(),
              "file": str(downloaded), "checks": checks, "rendered": bool(renderer)}
    (folder / "independent-verification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
