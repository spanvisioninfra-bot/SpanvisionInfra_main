"""Independently validate the actual browser downloads with IfcOpenShell.

Run after verify-frame-ifc.mjs using the BIM validator's Python environment.
The expected door dimensions come from the hand-authored browser fixture.
"""
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate

root = Path(__file__).resolve().parents[1]
output = root / "qa" / "readiness"
records = []
for lod, count in [(200, 1), (300, 2), (400, 5)]:
    path = output / f"D100_lod{lod}.ifc"
    model = ifcopenshell.open(str(path))
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, logger, express_rules=True)
    assert not logger.statements, [(s.get("attribute"), s.get("message")) for s in logger.statements]
    assert len(model.by_type("IfcExtrudedAreaSolid")) == count
    door, = model.by_type("IfcDoor")
    assert math.isclose(door.OverallWidth, .9) and math.isclose(door.OverallHeight, 2.1)
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    mesh = ifcopenshell.geom.create_shape(settings, door).geometry
    vertices = list(mesh.verts)
    bounds = [(min(vertices[a::3]), max(vertices[a::3])) for a in range(3)]
    for actual, expected in zip(bounds, [(0., .9), (-.114, 0.), (0., 2.1)]):
        assert all(math.isclose(a, b, abs_tol=1e-8) for a, b in zip(actual, expected)), (lod, bounds)
    assert len(mesh.faces) > 0
    records.append({"lod": lod, "schemaIssues": 0, "solids": count, "boundsMetres": bounds,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    print(f"PASS LOD {lod}: IFC schema/EXPRESS rules and independent geometry bounds")
(output / "frame-ifc-geometry.json").write_text(json.dumps({
    "checkedAt": datetime.now(timezone.utc).isoformat(), "status": "passed",
    "validator": f"IfcOpenShell {ifcopenshell.version}", "records": records,
    "scope": "Three browser-exported rectangular door fixtures; not certification of fabrication or every frame shape.",
}, indent=2) + "\n", encoding="utf-8")
