"""Bounded, process-local guest records. Never serialized to a database or disk.

A page holds its random bearer token in JS memory, not cookies or Web Storage.
Closing it revokes the owner; expired owners cannot be recreated by late AI work.
The supplied Render entrypoint uses one process. Other workers fail closed (401).
"""
from copy import deepcopy
import json
import threading
import time
from services.conversation_transport import ConversationError

LOCK = threading.RLock()
ROWS = {}
OWNERS = {}
TTL = 20 * 60
MAX_OWNERS = 100
MAX_BYTES = 64 * 1024 * 1024
_started = False


def prune():
    now = time.time()
    for owner, deadline in list(OWNERS.items()):
        if deadline <= now:
            revoke(owner)


def revoke(owner):
    OWNERS.pop(owner, None)
    for key, row in list(ROWS.items()):
        if row['owner'] == owner:
            ROWS.pop(key, None)


def start(owner):
    global _started
    with LOCK:
        prune()
        if len(OWNERS) >= MAX_OWNERS:
            raise ConversationError('guest_capacity', 'Temporary chats are busy. Please try later or sign in.', 503)
        OWNERS[owner] = time.time() + TTL
        if not _started:
            def sweep():
                while True:
                    time.sleep(30)
                    with LOCK:
                        prune()
            threading.Thread(target=sweep, daemon=True, name='guest-memory-expiry').start()
            _started = True


def active(owner):
    return OWNERS.get(owner, 0) > time.time()


def copy(row):
    # Isolate mutable records from transactions and API response mutation.
    return deepcopy(row)


def check_capacity(changes):
    size = sum(len(json.dumps(r, ensure_ascii=False).encode()) for k, r in ROWS.items() if k not in changes)
    size += sum(len(json.dumps(r, ensure_ascii=False).encode()) for r in changes.values() if r)
    if size > MAX_BYTES:
        raise ConversationError('guest_capacity', 'Temporary storage is full. Clear this chat or sign in.', 503)
