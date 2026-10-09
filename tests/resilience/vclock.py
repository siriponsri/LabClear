"""A virtual clock for asyncio. MOCKED_TEST_ONLY.

``VirtualClockLoop.time()`` is virtual. While the loop has nothing to run and no real work is in
flight, the clock jumps straight to the next timer, so a 220-second workflow deadline, 10-second
heartbeats or a provider that hangs for ever resolve in milliseconds and in the same order every
run. While real work is in flight (a worker thread: storage, a sync route, a provider double, a
document worker process), virtual time advances at real speed, so a timer can never fire "early"
relative to real work that has not finished.

Real work is counted through ``run_in_executor`` (asyncio.to_thread) and ``anyio.to_thread.run_sync``
(Starlette's thread pool for sync routes), see ``install()``.
"""
from __future__ import annotations

import asyncio
import selectors
import time


class _Selector:
    def __init__(self, selector: selectors.BaseSelector, loop: "VirtualClockLoop"):
        self._selector, self._loop = selector, loop

    def __getattr__(self, name):
        return getattr(self._selector, name)

    def select(self, timeout=None):
        loop = self._loop
        if timeout == 0:
            return self._selector.select(0)
        if loop.real_work > 0:
            # Real work pending: wait a little in real time and let the virtual clock follow it.
            wait = 0.005 if timeout is None else min(timeout, 0.005)
            started = time.monotonic()
            events = self._selector.select(wait)
            loop.advance(time.monotonic() - started)
            return events
        events = self._selector.select(0)
        if events or timeout is None:
            return events or self._selector.select(None)
        loop.advance(timeout)  # idle: jump to the next timer
        loop.jumps += 1
        return []


class VirtualClockLoop(asyncio.SelectorEventLoop):
    def __init__(self):
        super().__init__()
        self._now = 1000.0
        self.real_work = 0
        self.jumps = 0
        self._selector = _Selector(self._selector, self)

    def time(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        if seconds > 0:
            self._now += seconds

    def run_in_executor(self, executor, func, *args):
        future = super().run_in_executor(executor, func, *args)
        self.real_work += 1
        future.add_done_callback(lambda _f: self._done())
        return future

    def _done(self) -> None:
        self.real_work -= 1


def install(loop: VirtualClockLoop) -> None:
    """Count Starlette/anyio worker threads as real work too."""
    import anyio.to_thread
    original = getattr(anyio.to_thread.run_sync, "__wrapped_original__", anyio.to_thread.run_sync)

    async def run_sync(func, *args, **kwargs):
        running = asyncio.get_running_loop()
        counted = isinstance(running, VirtualClockLoop)
        if counted:
            running.real_work += 1
        try:
            return await original(func, *args, **kwargs)
        finally:
            if counted:
                running.real_work -= 1

    run_sync.__wrapped_original__ = original
    anyio.to_thread.run_sync = run_sync


def run(main):
    """asyncio.run() on a fresh virtual-clock loop."""
    loop = VirtualClockLoop()
    install(loop)
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(main)
    finally:
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        finally:
            asyncio.set_event_loop(None)
            loop.close()
