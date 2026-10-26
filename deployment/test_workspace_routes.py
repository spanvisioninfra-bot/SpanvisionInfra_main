"""Exercise the real STL page handler without loading optional geometry drivers."""
import ast
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.testclient import TestClient

from deployment.tool_access import ToolAccess


class WorkspaceRouteTests(unittest.TestCase):
    def test_stl_workspace_aliases_serve_the_original_page_behind_access_checks(self):
        root = Path(__file__).resolve().parents[1] / 'spanvision-stl-3d-map-workspace'
        source = ast.parse((root / 'app/main.py').read_text(encoding='utf-8'))
        handler = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'index')
        api = FastAPI()
        namespace = {'app': api, 'HTMLResponse': HTMLResponse, 'WEB_DIR': root / 'web'}
        exec(compile(ast.Module(body=[handler], type_ignores=[]), 'stl-page-handler', 'exec'), namespace)
        gate = ToolAccess(api, 'stl', 'https://www.spanvisioninfra.com')
        gate.verify = lambda ticket: {'allowed': True, 'userId': 'route-fixture'} if ticket == 'route-fixture' else {'allowed': False, 'status': 401}
        with TestClient(gate, base_url='https://tool.example') as client:
            denied = client.get('/workspace', headers={'Accept': 'text/html'}, follow_redirects=False)
            self.assertEqual(denied.status_code, 303)
            client.cookies.set('__Host-sv-tool', 'route-fixture')
            expected = (root / 'web/index.html').read_text(encoding='utf-8')
            for route in ('/', '/workspace', '/workspace/'):
                response = client.get(route)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.text, expected)
                self.assertEqual(response.headers['cache-control'], 'private, no-store')


if __name__ == '__main__':
    unittest.main()
