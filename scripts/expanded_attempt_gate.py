"""Harness-only, durable global provider-attempt admission. Never resets counters.

The owner must first reconcile prior callers and authorize an exclusive testing window.
Call admit BEFORE every provider HTTP attempt; failure/cancellation never refunds it.
This gate supplements, and never replaces, existing money/quota reservations.
"""
from __future__ import annotations
import sqlite3
from pathlib import Path

class GateError(RuntimeError):
    pass

class AttemptGate:
    def __init__(self, path: str | Path, *, ceiling=3000, prior=23):
        self.path = str(path)
        if not isinstance(ceiling, int) or not isinstance(prior, int) or not 0 <= prior <= ceiling:
            raise GateError("invalid accounting")
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK(id=1), ceiling INTEGER NOT NULL, prior INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, workflow TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'reserved', at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
            db.execute("INSERT OR IGNORE INTO policy VALUES (1,?,?)", (ceiling, prior))
            policy = db.execute("SELECT ceiling,prior FROM policy WHERE id=1").fetchone()
            if policy != (ceiling, prior):
                raise GateError("existing accounting differs; no reset permitted")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA busy_timeout=10000")
        return db

    def admit(self, workflow: str, slot: str, *, workflow_cap=12):
        if not workflow or not slot or workflow_cap < 1:
            raise GateError("missing workflow accounting")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            ceiling, prior = db.execute("SELECT ceiling,prior FROM policy WHERE id=1").fetchone()
            used = db.execute("SELECT count(*) FROM attempts").fetchone()[0]
            local = db.execute("SELECT count(*) FROM attempts WHERE workflow=?", (workflow,)).fetchone()[0]
            if prior + used >= ceiling:
                raise GateError("global attempt ceiling reached")
            if local >= workflow_cap:
                raise GateError("workflow attempt ceiling reached")
            return db.execute("INSERT INTO attempts(workflow,slot) VALUES (?,?)", (workflow,slot)).lastrowid

    def finish(self, attempt: int, status: str):
        if status not in {"succeeded", "failed", "cancelled"}:
            raise GateError("invalid status")
        with self.connect() as db:
            row=db.execute("SELECT status FROM attempts WHERE id=?", (attempt,)).fetchone()
            if row is None: raise GateError("unknown attempt")
            if row[0] != "reserved":
                if row[0] != status: raise GateError("settlement conflict")
                return
            db.execute("UPDATE attempts SET status=? WHERE id=?", (status,attempt))

    def snapshot(self):
        with self.connect() as db:
            ceiling,prior=db.execute("SELECT ceiling,prior FROM policy WHERE id=1").fetchone()
            counts=dict(db.execute("SELECT status,count(*) FROM attempts GROUP BY status"))
            used=sum(counts.values())
            return {"ceiling":ceiling,"prior_conservative":prior,"new_attempts":used,"remaining":ceiling-prior-used,"statuses":counts}

    def authorize_ceiling(self, ceiling: int, authorization: str):
        """Explicit owner ceiling adjustment; counts/history are never reset."""
        if not isinstance(ceiling,int) or ceiling<1 or not authorization.strip():
            raise GateError('explicit ceiling authorization required')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous,prior=db.execute('SELECT ceiling,prior FROM policy WHERE id=1').fetchone()
            used=db.execute('SELECT count(*) FROM attempts').fetchone()[0]
            if ceiling<prior+used:raise GateError('ceiling below already consumed attempts')
            db.execute('CREATE TABLE IF NOT EXISTS ceiling_authorizations (id INTEGER PRIMARY KEY, previous INTEGER, updated INTEGER, authorization TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP)')
            db.execute('INSERT INTO ceiling_authorizations(previous,updated,authorization) VALUES(?,?,?)',(previous,ceiling,authorization))
            db.execute('UPDATE policy SET ceiling=? WHERE id=1',(ceiling,))
