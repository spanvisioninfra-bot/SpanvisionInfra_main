"""Require a centrally verified trial/paid grant before cloud pages, assets and APIs."""
import asyncio
import json
import os
import time
from datetime import datetime
from http.cookies import SimpleCookie
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

from starlette.responses import JSONResponse, RedirectResponse, Response

COOKIE = '__Host-sv-tool'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ToolAccess:
    def __init__(self, app, tool, account_origin=None):
        self.app, self.tool = app, tool
        self.origin = (account_origin or os.environ.get('SPANVISION_ACCOUNT_ORIGIN', 'https://www.spanvisioninfra.com')).rstrip('/')
        url = urlsplit(self.origin)
        if url.username or url.password or url.path or url.query or url.fragment or (url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1'))):
            raise ValueError('Invalid account service origin')
        self.cache = {}
        self.headers = {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'}

    def verify(self, ticket):
        if not isinstance(ticket, str) or not ticket or len(ticket) > 1600:
            return {'allowed': False, 'status': 401}
        now = time.time()
        cached = self.cache.get(ticket)
        if cached and cached[0] > now:
            return cached[1]
        try:
            request = Request(self.origin + '/api/account/tool-verify', data=json.dumps({'ticket': ticket, 'tool': self.tool}).encode(), headers={'Content-Type': 'application/json'}, method='POST')
            with build_opener(NoRedirect).open(request, timeout=10) as response:
                data = json.loads(response.read(4097))
            expiry = datetime.fromisoformat(data['expiresAt'].replace('Z', '+00:00')).timestamp()
            if data.get('allowed') is not True or data.get('tool') != self.tool or not isinstance(data.get('userId'), str) or not data['userId'] or expiry <= now:
                return {'allowed': False, 'status': 401}
            if len(self.cache) >= 128:
                self.cache.pop(next(iter(self.cache)))
            self.cache[ticket] = (min(now + 15, expiry), data)
            return data
        except HTTPError as error:
            return {'allowed': False, 'status': error.code if error.code in (401, 402) else 503}
        except (URLError, OSError, ValueError, KeyError, TypeError):
            return {'allowed': False, 'status': 503}

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'lifespan':
            return await self.app(scope, receive, send)
        if scope['type'] != 'http':
            return await send({'type': 'websocket.close', 'code': 4401})
        path = scope['path']
        if scope['method'] in ('GET', 'HEAD') and path in ('/health', '/api/ping'):
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        launch = self.origin + '/launch/' + self.tool
        if path == '/__spanvision/access':
            if scope['method'] != 'POST' or headers.get(b'origin', b'').decode() != self.origin or not headers.get(b'content-type', b'').startswith(b'application/x-www-form-urlencoded'):
                return await JSONResponse({'error': 'Open this tool from your account.'}, 403, headers=self.headers)(scope, receive, send)
            body = bytearray()
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                body.extend(message.get('body', b''))
                if len(body) > 4096:
                    return await Response(status_code=413, headers=self.headers)(scope, receive, send)
                if not message.get('more_body', False):
                    break
            fields = parse_qs(body.decode('utf-8', errors='replace'))
            ticket = fields.get('ticket', [''])[0]
            access = await asyncio.to_thread(self.verify, ticket)
            if access.get('allowed') is not True:
                return await JSONResponse({'error': 'Your tool session could not be opened.', 'launchUrl': launch}, access['status'], headers=self.headers)(scope, receive, send)
            target = fields.get('next', ['/'])[0]
            if not target.startswith('/') or target.startswith('//') or target.startswith('/__spanvision/') or any(ord(char) <= 32 or char == '\\' for char in target):
                target = '/'
            expiry = datetime.fromisoformat(access['expiresAt'].replace('Z', '+00:00')).timestamp()
            response = RedirectResponse(target, status_code=303, headers=self.headers)
            response.set_cookie(COOKIE, ticket, max_age=max(0, int(expiry-time.time())), path='/', secure=True, httponly=True, samesite='lax')
            appearance = fields.get('appearance', [''])[0]
            if appearance in ('light', 'dark'):
                response.set_cookie('sv-appearance', appearance, max_age=31536000, path='/', secure=True, samesite='lax')
            return await response(scope, receive, send)
        cookie = SimpleCookie()
        try:
            cookie.load(headers.get(b'cookie', b'').decode())
            ticket = cookie[COOKIE].value if COOKIE in cookie else None
        except (ValueError, KeyError):
            ticket = None
        access = await asyncio.to_thread(self.verify, ticket)
        if path == '/__spanvision/session':
            return await JSONResponse({**access, 'launchUrl': launch}, 200 if access.get('allowed') else access['status'], headers=self.headers)(scope, receive, send)
        if not access.get('allowed'):
            status = access['status']
            response = RedirectResponse(launch, status_code=303, headers=self.headers) if status != 503 and scope['method'] in ('GET', 'HEAD') and b'text/html' in headers.get(b'accept', b'') else JSONResponse({'error': 'A trial or paid tool session is required.', 'launchUrl': launch}, status, headers=self.headers)
            return await response(scope, receive, send)
        scoped = {**scope, 'spanvision.account_id': access['userId']}

        async def private_send(message):
            if message['type'] == 'http.response.start':
                message = {**message, 'headers': [(key, value) for key, value in message.get('headers', []) if key.lower() != b'cache-control'] + [(b'cache-control', b'private, no-store')]}
            await send(message)
        return await self.app(scoped, receive, private_send)
