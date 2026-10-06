from __future__ import annotations

import multiprocessing
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from services.provider_budget import (
    AttemptReceipt,
    ProviderBudgetError,
    SQLiteAttemptBudget,
    close_configured_cycle,
    create_configured_cycle,
)


LIMITS = {"llm": 5, "ocr": 5, "systemone": 5}


def _process_reservation(path: str, cycle_id: str, queue, outbound_calls) -> None:
    budget = SQLiteAttemptBudget(Path(path), cycle_id, True)
    try:
        reservation = budget.reserve("llm", "runner")
        with outbound_calls.get_lock():
            outbound_calls.value += 1
        budget.finish(reservation, "succeeded")
        queue.put("reserved")
    except ProviderBudgetError as exc:
        queue.put(exc.code)


def test_limit_five_rejects_sixth_attempt_without_transport(tmp_path):
    path = tmp_path / "budget.sqlite3"
    SQLiteAttemptBudget.create_cycle(path, "cycle", LIMITS)
    calls = []
    budget = SQLiteAttemptBudget(path, "cycle", True)

    for _ in range(5):
        reservation = budget.reserve("llm", "runner")
        calls.append(reservation.attempt_id)
        budget.finish(reservation, "failed", "provider_timeout")

    with pytest.raises(ProviderBudgetError, match="exhausted"):
        budget.reserve("llm", "runner")

    assert len(calls) == 5
    assert budget.snapshot()["llm_used"] == 5


def test_concurrent_threads_share_one_atomic_limit(tmp_path):
    path = tmp_path / "budget.sqlite3"
    SQLiteAttemptBudget.create_cycle(path, "cycle", LIMITS)

    def fake_outbound() -> bool:
        budget = SQLiteAttemptBudget(path, "cycle", True)
        try:
            reservation = budget.reserve("ocr", "ocr")
        except ProviderBudgetError as exc:
            assert exc.code == "provider_budget_exhausted"
            return False
        budget.finish(reservation, "failed", "provider_invalid_response")
        return True

    with ThreadPoolExecutor(max_workers=12) as pool:
        calls = list(pool.map(lambda _: fake_outbound(), range(12)))

    assert sum(calls) == 5
    assert SQLiteAttemptBudget(path, "cycle", True).snapshot()["ocr_used"] == 5


def test_multiple_processes_share_one_atomic_limit(tmp_path):
    path = tmp_path / "budget.sqlite3"
    SQLiteAttemptBudget.create_cycle(path, "cycle", LIMITS)
    context = multiprocessing.get_context("spawn")
    queue = context.Queue()
    outbound_calls = context.Value("i", 0)
    processes = [
        context.Process(target=_process_reservation, args=(str(path), "cycle", queue, outbound_calls))
        for _ in range(8)
    ]
    for process in processes:
        process.start()
    results = [queue.get(timeout=15) for _ in processes]
    for process in processes:
        process.join(timeout=15)

    assert sum(result == "reserved" for result in results) == 5
    assert results.count("provider_budget_exhausted") == 3
    assert outbound_calls.value == 5
    assert SQLiteAttemptBudget(path, "cycle", True).snapshot()["llm_used"] == 5


def test_restart_preserves_failed_attempts_and_missing_cycle_fails_closed(tmp_path):
    path = tmp_path / "budget.sqlite3"
    SQLiteAttemptBudget.create_cycle(path, "existing", LIMITS)
    first = SQLiteAttemptBudget(path, "existing", True)
    reservation = first.reserve("systemone", "systemone_shadow")
    first.finish(reservation, "failed", "provider_unavailable")

    restarted = SQLiteAttemptBudget(path, "existing", True)
    assert restarted.snapshot()["systemone_used"] == 1
    missing = SQLiteAttemptBudget(path, "missing", True)
    with pytest.raises(ProviderBudgetError, match="not initialized"):
        missing.reserve("systemone", "systemone_shadow")


def test_offline_guard_consumes_no_ledger_and_no_transport(tmp_path):
    path = tmp_path / "offline.sqlite3"
    budget = SQLiteAttemptBudget(path, "offline", False)
    transport_calls = []
    with pytest.raises(ProviderBudgetError, match="disabled"):
        budget.reserve("llm", "chat")
    assert transport_calls == []
    assert not path.exists()


def test_configured_cycle_uses_server_limits_and_explicit_close(monkeypatch, tmp_path):
    monkeypatch.setattr("config.settings.PROVIDER_NETWORK_ENABLED", True)
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_PATH", str(tmp_path / "configured.sqlite3"))
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_LLM_LIMIT", 2)
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_OCR_LIMIT", 3)
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_SYSTEMONE_LIMIT", 4)
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_CYCLE_ID", "configured")

    create_configured_cycle("configured")
    budget = SQLiteAttemptBudget(tmp_path / "configured.sqlite3", "configured", True)
    snapshot = budget.snapshot()
    assert snapshot["llm_limit"] == 2
    assert snapshot["ocr_limit"] == 3
    assert snapshot["systemone_limit"] == 4

    close_configured_cycle("configured")
    with pytest.raises(ProviderBudgetError, match="not active"):
        budget.reserve("llm", "runner")


def test_output_rejection_amends_finished_attempt_without_refunding_quota(tmp_path):
    path = tmp_path / "output-rejection.sqlite3"
    SQLiteAttemptBudget.create_cycle(path, "cycle", LIMITS)
    budget = SQLiteAttemptBudget(path, "cycle", True)
    reservation = budget.reserve("llm", "chat")
    budget.finish(reservation, "succeeded")

    receipt = budget.amend_output_rejection(
        AttemptReceipt(reservation.attempt_id, "cycle", "llm", "chat", "succeeded"),
        "provider_output_missing_citation",
    )

    assert receipt.outcome == "output_rejected"
    assert receipt.reason_code == "provider_output_missing_citation"
    snapshot = budget.snapshot()
    assert snapshot["llm_used"] == 1
    connection = SQLiteAttemptBudget._connect(path)
    try:
        row = connection.execute(
            "SELECT outcome, reason_code FROM provider_attempts WHERE attempt_id = ?",
            (reservation.attempt_id,),
        ).fetchone()
    finally:
        connection.close()
    assert row == ("output_rejected", "provider_output_missing_citation")


def test_legacy_ledger_schema_upgrade_preserves_existing_attempts(tmp_path):
    path = tmp_path / "legacy-provider-budget.sqlite3"
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE provider_budget_cycles (
            cycle_id TEXT PRIMARY KEY,
            llm_limit INTEGER NOT NULL,
            ocr_limit INTEGER NOT NULL,
            systemone_limit INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        INSERT INTO provider_budget_cycles VALUES ('cycle', 5, 5, 5, 'active', 'now');
        CREATE TABLE provider_attempts (
            attempt_id TEXT PRIMARY KEY,
            cycle_id TEXT NOT NULL,
            provider_slot TEXT NOT NULL,
            source_path TEXT NOT NULL,
            reserved_at TEXT NOT NULL,
            outcome TEXT NOT NULL DEFAULT 'reserved',
            reason_code TEXT,
            finished_at TEXT
        );
        INSERT INTO provider_attempts VALUES ('old-attempt', 'cycle', 'llm', 'chat', 'now', 'failed', 'old_reason', 'now');
        CREATE INDEX provider_attempts_cycle_slot ON provider_attempts(cycle_id, provider_slot);
        """
    )
    connection.close()

    budget = SQLiteAttemptBudget(path, "cycle", True)
    reservation = budget.reserve("llm", "runner")
    budget.finish(reservation, "succeeded")

    assert budget.snapshot()["llm_used"] == 2
    connection = sqlite3.connect(path)
    try:
        rows = connection.execute(
            "SELECT attempt_id, outcome, reason_code FROM provider_attempts ORDER BY attempt_id"
        ).fetchall()
    finally:
        connection.close()
    assert ("old-attempt", "failed", "old_reason") in rows
