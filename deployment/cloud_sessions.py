"""Anonymous browser sessions for the single-worker cloud preview.

Cookies identify a private workspace, not a user account. All state is ephemeral.
The ASGI context includes background tasks and is copied into FastAPI threads.
"""
from collections.abc import MutableMapping
from contextvars import ContextVar
from http.cookies import SimpleCookie
import secrets
import hashlib
import time
from threading import RLock
from urllib.parse import urlsplit
import asyncio
from tempfile import SpooledTemporaryFile

from starlette.responses import JSONResponse

session_id = ContextVar('spanvision_cloud_session', default='bootstrap')
_states = {}
_activity = {}
_lock = RLock()
COOKIE = '__Host-spanvision-workspace'


class SessionObject:
    def __init__(self, name, factory):
        self.name, self.factory = name, factory

    def value(self):
        with _lock:
            state = _states[session_id.get()]
            if self.name not in state:
                state[self.name] = self.factory()
            return state[self.name]

    def __getattr__(self, name):
        return getattr(self.value(), name)


class SessionMapping(SessionObject, MutableMapping):
    def __getitem__(self, key):
        return self.value()[key]

    def __setitem__(self, key, value):
        self.value()[key] = value

    def __delitem__(self, key):
        del self.value()[key]

    def __iter__(self):
        return iter(self.value())

    def __len__(self):
        return len(self.value())


class CloudSessions:
    def __init__(self, app, secure=True, max_body_bytes=55 * 1024 * 1024):
        self.app, self.secure = app, secure
        self.max_body_bytes = max_body_bytes
        self.cookie_name = COOKIE if secure else 'spanvision-workspace-test'

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        if scope['path'] in ('/health', '/api/ping') or scope['path'].startswith(('/assets/', '/static/')):
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        try:
            length = int(headers.get(b'content-length', b'0'))
            too_large = length < 0 or length > self.max_body_bytes
        except ValueError:
            too_large = True
        if too_large:
            return await JSONResponse({'detail': 'Choose an upload smaller than 50 MB for this cloud preview.'}, 413)(scope, receive, send)
        origin = headers.get(b'origin', b'').decode()
        host = headers.get(b'host', b'').decode()
        if scope['method'] not in ('GET', 'HEAD', 'OPTIONS') and origin and urlsplit(origin).netloc != host:
            return await JSONResponse({'detail': 'Use this workspace from its own website.'}, 403)(scope, receive, send)
        cookie = SimpleCookie()
        try:
            cookie.load(headers.get(b'cookie', b'').decode())
            sid = cookie[self.cookie_name].value if self.cookie_name in cookie else None
        except (ValueError, KeyError):
            sid = None
        with _lock:
            now = time.monotonic()
            for old in list(_activity):
                seen, active = _activity[old]
                if not active and now - seen > 86400:
                    _states.pop(old, None)
                    del _activity[old]
            is_new = sid not in _states
            busy = is_new and len(_states) >= 256
            # Bound the number of in-memory workspaces on a small preview instance.
            if is_new and not busy:
                sid = secrets.token_hex(32)
                _states[sid] = {}
            if not busy:
                _activity[sid] = (now, _activity.get(sid, (now, 0))[1] + 1)
        if busy:
            return await JSONResponse({'detail': 'This preview is busy. Please try again later.'}, 503)(scope, receive, send)
        # Existing BIM tenant filtering consumes trusted proxy identity headers.
        # Strip all visitor-supplied identity before setting our workspace scope.
        scoped = dict(scope)
        scoped['headers'] = [(key, value) for key, value in scope.get('headers', []) if not key.lower().startswith(b'x-authentik-') and key.lower() != b'x-tenant']
        tenant = hashlib.sha256(sid.encode()).hexdigest()
        scoped['headers'] += [(b'x-authentik-username', b'cloud-preview'), (b'x-authentik-meta-tenant', tenant.encode())]
        token = session_id.set(sid)

        async def send_private(message):
            if message['type'] == 'http.response.start':
                message = dict(message)
                extra = [(b'x-content-type-options', b'nosniff')]
                if scope['path'].startswith('/api/'):
                    extra.append((b'cache-control', b'private, no-store'))
                if is_new:
                    secure = '; Secure' if self.secure else ''
                    extra.append((b'set-cookie', f'{self.cookie_name}={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400{secure}'.encode()))
                message['headers'] = list(message.get('headers', [])) + extra
            await send(message)

        # Content-Length is optional and untrusted. Bound the actual streamed
        # body before handing it to a multipart/JSON parser. Spooling avoids
        # keeping a whole model in RAM while preserving ASGI streaming reads.
        body = SpooledTemporaryFile(max_size=1024 * 1024)
        async def collect_body():
            size = 0
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return 400
                chunk = message.get('body', b'')
                size += len(chunk)
                if size > self.max_body_bytes:
                    return 413
                body.write(chunk)
                if not message.get('more_body', False):
                    body.seek(0)
                    return None

        body_delivered = False
        async def bounded_receive():
            nonlocal body_delivered
            if body_delivered:
                return await receive()
            chunk = body.read(1024 * 1024)
            more = body.tell() < body_size
            body_delivered = not more
            return {'type': 'http.request', 'body': chunk, 'more_body': more}

        try:
            try:
                status = await asyncio.wait_for(collect_body(), timeout=120)
            except asyncio.TimeoutError:
                status = 408
            if status:
                detail = 'Choose an upload smaller than 50 MB for this cloud preview.' if status == 413 else 'The upload did not complete. Please try again.'
                return await JSONResponse({'detail': detail}, status)(scope, receive, send_private)
            body.seek(0, 2)
            body_size = body.tell()
            body.seek(0)
            await self.app(scoped, bounded_receive, send_private)
        finally:
            body.close()
            session_id.reset(token)
            with _lock:
                _activity[sid] = (time.monotonic(), _activity[sid][1] - 1)
