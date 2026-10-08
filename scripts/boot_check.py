"""Exercise the unchanged Render entry point inside offline_check's isolated env.

Real Uvicorn startup on an OS-assigned local port, ASGI HTTP checks, graceful stop.
The repository dotenv read is suppressed to preserve isolation; no provider doubles.
"""
import asyncio
import json
import os
from pathlib import Path
import runpy

import dotenv
import httpx
import uvicorn

ROOT = Path(__file__).resolve().parents[1]
records = []
dotenv.load_dotenv = lambda *args, **kwargs: False
os.environ['PORT'] = '0'
OriginalServer = uvicorn.Server


class SmokeServer(OriginalServer):
    async def serve(self, sockets=None):
        task = asyncio.create_task(super().serve(sockets))
        try:
            for _ in range(200):
                if self.started:
                    break
                if task.done():
                    await task
                    raise RuntimeError('Uvicorn exited before startup')
                await asyncio.sleep(.05)
            assert self.started, 'Uvicorn did not start'
            from main import app
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
                for path, status in [('/health', 200), ('/', 200), ('/app', 200), ('/staff', 200), ('/packages', 200),
                                     ('/preview/landing', 404), ('/hospital-links', 404), ('/organization-references', 404)]:
                    response = await client.get(path)
                    assert response.status_code == status, (path, response.status_code)
                    records.append({'path': path, 'status': status})
        finally:
            self.should_exit = True
            await task


uvicorn.Server = SmokeServer
runpy.run_path(str(ROOT / 'scripts/run_business.py'), run_name='__main__')
result = {'status': 'PASS', 'entrypoint': 'scripts/run_business.py', 'storage': 'isolated temporary SQLite',
          'dotenv': 'suppressed for isolation', 'provider_doubles': False, 'provider_network': 'socket-denied',
          'production_postgresql': 'NOT_RUN', 'checks': records}
(ROOT / 'docs/ceo-upgrade/evidence/boot.json').write_text(json.dumps(result, indent=2) + '\n')
print('PASS: Render entrypoint started and stopped; 8 route checks; no new keys or provider network.')
