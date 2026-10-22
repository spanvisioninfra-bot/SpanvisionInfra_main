"""Isolated access tests; no production database, auth account or engine is contacted."""
import time
import unittest
from datetime import datetime, timezone
from urllib.parse import urlencode

from starlette.responses import JSONResponse
from starlette.testclient import TestClient
from deployment.tool_access import ToolAccess
from deployment.cloud_sessions import CloudSessions, SessionMapping


async def private_app(scope, receive, send):
    if scope['type'] == 'lifespan':
        while True:
            event = await receive()
            await send({'type': event['type'] + '.complete'})
            if event['type'] == 'lifespan.shutdown':
                return
    await JSONResponse({'user': scope.get('spanvision.account_id'), 'path': scope['path']})(scope, receive, send)


def gateway(tool='bim'):
    gate = ToolAccess(private_app, tool, 'https://www.spanvisioninfra.com')
    def verify(ticket):
        if ticket in ('account-a', 'account-b'):
            return {'allowed': True, 'tool': tool, 'userId': ticket, 'expiresAt': datetime.fromtimestamp(time.time()+60, timezone.utc).isoformat()}
        return {'allowed': False, 'status': 401}
    gate.verify = verify
    return gate


class ToolAccessTests(unittest.TestCase):
    def test_all_services_require_access_for_pages_assets_and_apis(self):
        for tool in ('bim', 'stl', 'fem'):
            with TestClient(gateway(tool), base_url='https://tool.example') as client:
                for path in ('/', '/assets/app.js', '/static/app.js', '/api/projects', '/docs', '/openapi.json'):
                    self.assertEqual(client.get(path).status_code, 401)
                self.assertEqual(client.get('/health').status_code, 200)
                redirect = client.get('/', headers={'Accept': 'text/html'}, follow_redirects=False)
                self.assertEqual(redirect.status_code, 303)
                self.assertIn('tool='+tool, redirect.headers['location'])

    def test_verified_form_handoff_session_and_identity(self):
        with TestClient(gateway(), base_url='https://tool.example') as client:
            self.assertEqual(client.post('/__spanvision/access', data={'ticket': 'account-a'}, headers={'Origin': 'https://untrusted.test'}).status_code, 403)
            response = client.post('/__spanvision/access', data={'ticket': 'account-a', 'next': '//untrusted.test'}, headers={'Origin': 'https://www.spanvisioninfra.com'}, follow_redirects=False)
            self.assertEqual(response.status_code, 303)
            self.assertEqual(response.headers['location'], '/')
            self.assertIn('HttpOnly', response.headers['set-cookie'])
            self.assertIn('Secure', response.headers['set-cookie'])
            self.assertEqual(client.get('/api/projects').json()['user'], 'account-a')
            self.assertTrue(client.get('/__spanvision/session').json()['allowed'])
            self.assertEqual(client.get('/assets/app.js').headers['cache-control'], 'private, no-store')
            oversized = client.post('/__spanvision/access', content='ticket='+('x'*5000), headers={'Origin': 'https://www.spanvisioninfra.com', 'Content-Type': 'application/x-www-form-urlencoded'})
            self.assertEqual(oversized.status_code, 413)

    def test_account_switches_cannot_reuse_another_accounts_cloud_workspace(self):
        data = SessionMapping('trial-test-private', dict)
        async def app(scope, receive, send):
            if scope['type'] == 'lifespan':
                return await private_app(scope, receive, send)
            if scope['method'] == 'POST':
                data['private'] = scope['spanvision.account_id']
            await JSONResponse(dict(data))(scope, receive, send)
        gate = gateway()
        gate.app = CloudSessions(app, secure=True)
        with TestClient(gate, base_url='https://tool.example') as client:
            client.cookies.set('__Host-sv-tool', 'account-a')
            self.assertEqual(client.post('/api/data').json(), {'private': 'account-a'})
            client.cookies.set('__Host-sv-tool', 'account-b')
            self.assertEqual(client.get('/api/data').json(), {})


if __name__ == '__main__':
    unittest.main()
