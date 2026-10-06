"""Actual ASGI chunks, including uploads with no Content-Length header."""
import asyncio
import unittest
from deployment.cloud_sessions import CloudSessions


class StreamLimits(unittest.TestCase):
    def request(self, chunks, headers=()):
        messages, consumed = [], []
        reached_app = []

        async def app(scope, receive, send):
            reached_app.append(True)
            content = b''
            while True:
                message = await receive()
                content += message['body']
                if not message['more_body']:
                    break
            await send({'type': 'http.response.start', 'status': 200, 'headers': []})
            await send({'type': 'http.response.body', 'body': content})

        async def receive():
            index = len(consumed)
            consumed.append(index)
            return {'type': 'http.request', 'body': chunks[index], 'more_body': index < len(chunks) - 1}

        async def send(message):
            messages.append(message)

        scope = {'type': 'http', 'method': 'POST', 'path': '/api/upload', 'headers': list(headers)}
        asyncio.run(CloudSessions(app, secure=False, max_body_bytes=10)(scope, receive, send))
        return messages, consumed, reached_app

    def test_chunked_upload_cannot_bypass_limit(self):
        messages, consumed, reached = self.request([b'123456', b'789012', b'extra'])
        self.assertEqual(messages[0]['status'], 413)
        self.assertEqual(len(consumed), 2)
        self.assertFalse(reached, 'do not parse, persist, or process an oversized upload')

    def test_lying_content_length_cannot_bypass_limit(self):
        messages, _, reached = self.request([b'01234567890'], [(b'content-length', b'1')])
        self.assertEqual(messages[0]['status'], 413)
        self.assertFalse(reached)

    def test_boundary_body_is_preserved_for_application(self):
        messages, _, reached = self.request([b'01234', b'56789'])
        self.assertEqual(messages[0]['status'], 200)
        self.assertEqual(messages[1]['body'], b'0123456789')
        self.assertTrue(reached)


if __name__ == '__main__':
    unittest.main()
