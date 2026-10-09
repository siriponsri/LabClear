"""Render entry point: one Uvicorn process (Guest state lives in process memory), optional LINE worker.

Binds 0.0.0.0:$PORT. On SIGTERM (a deploy or a restart) the service drains instead of dropping
requests: /ready turns 503 and new AI work is refused with server_draining at once, in-flight
workflows get SHUTDOWN_DRAIN_SECONDS to finish, the rest are cancelled with a terminal stream event,
then Uvicorn closes the connections and the process exits with status 0, inside Render's shutdown
window (30 s by default). A second signal skips the drain.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn  # noqa: E402


class DrainingServer(uvicorn.Server):
    """Starts the application's drain on the first SIGTERM/SIGINT, then lets Uvicorn shut down."""

    def handle_exit(self, sig, frame):
        from services import execution
        if not execution.lifecycle.draining:
            execution.lifecycle.begin_drain()
            loop = asyncio.get_event_loop()
            # Signal handlers run between bytecodes on the main thread: schedule, never block here.
            loop.call_soon_threadsafe(lambda: setattr(self, '_drain', loop.create_task(self._drain_then_exit(sig, frame))))
            return
        super().handle_exit(sig, frame)  # a second signal: stop now

    async def _drain_then_exit(self, sig, frame):
        from config import settings
        from services import execution
        await execution.lifecycle.drain(settings.SHUTDOWN_DRAIN_SECONDS)
        # Then Uvicorn's own graceful shutdown: stop listening, close idle connections, exit 0.
        self.should_exit = True


def config(app='main:app', host='0.0.0.0', port=None, log_level='warning') -> uvicorn.Config:
    from config import settings
    return uvicorn.Config(app, host=host, port=int(port or os.getenv('PORT', '8000')), log_level=log_level, workers=1,
                          # Backstop after the application's own drain (the drain cancels what remains).
                          timeout_graceful_shutdown=int(settings.SHUTDOWN_DRAIN_SECONDS) + 5)


async def main():
    import logging
    logging.getLogger('labclear').setLevel(logging.INFO)
    server = DrainingServer(config())
    tasks = []
    if os.getenv('BUSINESS_WORKER_ENABLED') == 'true':
        from services.business_worker import main as worker
        tasks.append(asyncio.create_task(worker()))
    try:
        await server.serve()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')  # only when run as the service, never on import
    asyncio.run(main())
