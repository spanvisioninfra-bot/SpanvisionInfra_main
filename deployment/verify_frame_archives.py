"""Independently inspect the actual browser ZIP downloads with Python's ZIP/CSV readers."""
import csv
import io
import json
from pathlib import Path
from zipfile import ZipFile

out = Path(__file__).resolve().parents[1] / 'qa' / 'readiness'
checks = []
with ZipFile(out / 'frame-production.zip') as archive:
    assert archive.testzip() is None, 'ZIP CRC validation failed'
    assert set(archive.namelist()) == {'cut-list.csv', 'glass-list.csv', 'hardware-list.csv', 'gasket-list.csv', 'bill-of-materials.csv'}
    rows = list(csv.reader(io.StringIO(archive.read('cut-list.csv').decode('utf-8-sig')), delimiter=';'))
    assert rows[0] == ['Frame', 'Position', 'Member', 'Profile', 'Material', 'Net_mm', 'Gross_mm', 'Angle_left_deg', 'Angle_right_deg', 'Quantity'] and len(rows) == 5
    # An independently specified default 1200 x 1500 mm timber frame has
    # two net jambs between its 67 mm rails and two through-running rails.
    assert sorted(float(row[5]) for row in rows[1:]) == [1200, 1200, 1366, 1366], rows
    checks.append('Production ZIP passes CRC and contains five independently readable CSV files with correct cut lengths')
with ZipFile(out / 'frame-cnc.zip') as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == 4
    for name in archive.namelist():
        text = archive.read(name).decode('utf-8')
        assert name.endswith('.nc')
        assert text.startswith('( GENERIC PREVIEW - NOT MACHINE-VERIFIED.'), 'Missing generic CNC production limitation'
        assert 'TENON TOOLPATHS ARE NOT IMPLEMENTED.' in text
    checks.append('Every CNC file is explicitly labelled as a generic unverified preview')
(out / 'frame-archive-validation.json').write_text(json.dumps({'passed': True, 'checks': checks}, indent=2) + '\n', encoding='utf-8')
print(f'PASS Frame downloaded archives: {len(checks)} independent validations')
