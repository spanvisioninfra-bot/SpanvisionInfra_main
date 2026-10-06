"""Exercise the actual FEM Rust binary through HTTP, without substituting results."""
import unittest
from starlette.testclient import TestClient
from deployment.fem_api import app, ENGINE_DIR


class FEMBridgeTests(unittest.TestCase):
    def test_invalid_sections_are_rejected_and_service_recovers(self):
        with TestClient(app) as client:
            for height in (0, -1):
                response = client.post('/api/doorsnede', json=[{'naam': 'Invalid section', 'soort': 'Rechthoek', 'h': height, 'b': 100}])
                self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(client.get('/health').status_code, 200)
            response = client.post('/api/doorsnede', json=[{'naam': 'Valid section', 'soort': 'Rechthoek', 'h': 200, 'b': 100}])
            self.assertEqual(response.status_code, 200, response.text)
            self.assertAlmostEqual(response.json()[0]['area_mm2'], 20000, delta=1)

    def test_rectangle_section_matches_independent_area_and_inertia(self):
        with TestClient(app) as client:
            response = client.post('/api/doorsnede', json=[{'naam': 'Rectangle reference', 'soort': 'Rechthoek', 'h': 200, 'b': 100}])
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()[0]
            self.assertAlmostEqual(result['area_mm2'], 200 * 100, delta=1)
            self.assertAlmostEqual(result['iy_mm4'], 100 * 200**3 / 12, delta=100)
            self.assertAlmostEqual(result['iz_mm4'], 200 * 100**3 / 12, delta=100)

    def test_real_checks_and_rejected_command(self):
        with TestClient(app) as client:
            result = client.post('/api/toetsing', json={'opdracht': 'check_steel_beams', 'inputs': []})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertIsInstance(result.json(), (list, dict))
            invalid = client.post('/api/toetsing', json={'opdracht': 'not_a_command'})
            self.assertEqual(invalid.status_code, 400)
            self.assertIn('fout', invalid.json())
            self.assertEqual(client.get('/api/toetsing').status_code, 405)

    def test_invalid_json_and_size_limit(self):
        with TestClient(app) as client:
            self.assertEqual(client.post('/api/toetsing', content='not JSON').status_code, 400)
            self.assertEqual(client.post('/api/toetsing', json=[]).status_code, 400)
            self.assertEqual(client.post('/api/toetsing', content=b'x' * (2 * 1024 * 1024 + 1)).status_code, 413)

    def test_unknown_fields_are_rejected_by_rust(self):
        with TestClient(app) as client:
            result = client.post('/api/toetsing', json={'opdracht': 'check_steel_beams', 'inputs': [], 'unsupported': True})
            self.assertEqual(result.status_code, 400)
            self.assertIn('fout', result.json())
