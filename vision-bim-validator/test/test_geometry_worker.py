"""Real subprocess conversion and crash/timeout containment."""
from pathlib import Path
import subprocess
from unittest.mock import patch
from server.ifc_processor import IFCProcessor

DEMO = Path(__file__).resolve().parents[2] / 'ifc-view' / 'demo' / 'Spanvision-IFC-View-Demo.ifc'

def test_subprocess_keeps_real_geometry_and_serializable_materials(tmp_path):
    result = IFCProcessor(tmp_path).process_isolated(str(DEMO), 'regression', 'json-mesh')
    assert result.success, result.error
    assert result.element_count > 0 and result.vertex_count > 0
    assert result.output_data['elements']
    assert not list(tmp_path.glob('geometry-job-*')), 'private IPC files must be removed'

def test_native_worker_crash_returns_a_failure_instead_of_terminating_server(tmp_path):
    with patch('server.ifc_processor.subprocess.run', return_value=subprocess.CompletedProcess([], 3221225477)):
        result = IFCProcessor(tmp_path).process_isolated(str(DEMO), 'crash', 'json-mesh')
    assert not result.success
    assert 'stopped unexpectedly' in result.error
    assert result.output_data is None

def test_timeout_returns_an_actionable_failure(tmp_path):
    with patch('server.ifc_processor.subprocess.run', side_effect=subprocess.TimeoutExpired([], 300)):
        result = IFCProcessor(tmp_path).process_isolated(str(DEMO), 'timeout', 'json-mesh')
    assert not result.success
    assert 'five minutes' in result.error
