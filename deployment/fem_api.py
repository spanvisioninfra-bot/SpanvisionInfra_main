"""Stateless browser bridge to the same Rust engines used by FEM's Windows app."""
import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parent.parent
ENGINE_DIR = Path(os.environ.get('SPANVISION_FEM_ENGINE_DIR', ROOT / 'fem-vision-studio/src-tauri/target/release'))
MAX_INPUT = 2 * 1024 * 1024
MAX_OUTPUT = 8 * 1024 * 1024
app = FastAPI(title='Spanvision Infra FEM engine bridge')
_slots = asyncio.Semaphore(1)

if os.name == 'posix':
    import resource

    def engine_limits():
        resource.setrlimit(resource.RLIMIT_AS, (320 * 1024 * 1024, 320 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (25, 30))


async def bounded_read(stream, limit):
    result = bytearray()
    while chunk := await stream.read(65536):
        result.extend(chunk)
        if len(result) > limit:
            raise HTTPException(502, 'The calculation result exceeds the service limit.')
    return bytes(result)


async def calculate(request: Request, engine: str):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_INPUT:
            raise HTTPException(413, 'Calculation input must not exceed 2 MB.')
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(400, 'Send valid JSON calculation input.') from None
    if (engine == 'toetsbrug' and not isinstance(data, dict)) or (engine == 'doorsnedemotor' and not isinstance(data, list)):
        raise HTTPException(400, 'The calculation input has the wrong structure.')
    executable = ENGINE_DIR / (engine + ('.exe' if os.name == 'nt' else ''))
    if not executable.is_file():
        raise HTTPException(503, 'The calculation engine is not installed on this service.')
    if _slots.locked():
        raise HTTPException(503, 'The calculation service is busy. Try again shortly.', headers={'Retry-After': '5'})
    async with _slots:
        process = None
        try:
            options = {'preexec_fn': engine_limits} if os.name == 'posix' else {}
            process = await asyncio.create_subprocess_exec(str(executable), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env={**os.environ, 'RAYON_NUM_THREADS': '1'}, **options)
            async def exchange():
                process.stdin.write(body)
                await process.stdin.drain()
                process.stdin.close()
                output, errors = await asyncio.gather(bounded_read(process.stdout, MAX_OUTPUT), bounded_read(process.stderr, 65536))
                await process.wait()
                return output, errors
            output, errors = await asyncio.wait_for(exchange(), timeout=30)
            try:
                result = json.loads(output)
            except (ValueError, UnicodeDecodeError):
                if process.returncode:
                    raise HTTPException(400, 'The engine rejected the calculation input.') from None
                raise HTTPException(502, 'The calculation engine returned an invalid result.') from None
            return JSONResponse(result, status_code=200 if process.returncode == 0 else 400)
        except TimeoutError:
            raise HTTPException(504, 'The calculation exceeded the 30-second service limit.') from None
        except OSError:
            raise HTTPException(503, 'The calculation engine could not start.') from None
        finally:
            if process and process.returncode is None:
                process.kill()
                await process.wait()


@app.get('/health')
async def health():
    suffix = '.exe' if os.name == 'nt' else ''
    ready = all((ENGINE_DIR / (name + suffix)).is_file() for name in ('toetsbrug', 'doorsnedemotor'))
    return JSONResponse({'status': 'ok' if ready else 'unavailable'}, status_code=200 if ready else 503)


@app.post('/api/toetsing')
async def checks(request: Request):
    return await calculate(request, 'toetsbrug')


@app.post('/api/doorsnede')
async def sections(request: Request):
    return await calculate(request, 'doorsnedemotor')
