from __future__ import annotations

import re
import sqlite3
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping


PROVIDER_SLOTS = ("llm", "ocr", "systemone")
SOURCE_PATHS = {
    "admin_test",
    "chat",
    "models",
    "chat_stream",
    "ocr",
    "systemone_shadow",
    "runner",
}
_CYCLE_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,79}\Z")
_OUTCOMES = {"succeeded", "failed", "blocked", "output_rejected"}


class ProviderBudgetError(Exception):
    """Stable, sanitized errors for provider guard and ledger failures."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class AttemptReservation:
    attempt_id: str
    cycle_id: str
    provider_slot: str
    source_path: str


@dataclass(frozen=True)
class AttemptReceipt:
    attempt_id: str
    cycle_id: str
    provider_slot: str
    source_path: str
    outcome: str
    reason_code: str | None = None


_LAST_ATTEMPT: ContextVar[AttemptReceipt | None] = ContextVar("labclear_last_provider_attempt", default=None)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _validate_cycle_id(cycle_id: str) -> str:
    if not isinstance(cycle_id, str) or not _CYCLE_ID_PATTERN.fullmatch(cycle_id):
        raise ProviderBudgetError("provider_cycle_invalid", "Provider attempt cycle is invalid.")
    return cycle_id


def _validate_limits(limits: Mapping[str, int]) -> dict[str, int]:
    if set(limits) != set(PROVIDER_SLOTS):
        raise ProviderBudgetError("provider_limits_invalid", "Provider attempt limits are invalid.")
    normalized: dict[str, int] = {}
    for slot in PROVIDER_SLOTS:
        value = limits[slot]
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 100_000:
            raise ProviderBudgetError("provider_limits_invalid", "Provider attempt limits are invalid.")
        normalized[slot] = value
    return normalized


def configured_attempt_limits() -> dict[str, int]:
    """Read cycle limits from server configuration, never from a request."""
    from config import settings

    return _validate_limits(
        {
            "llm": settings.PROVIDER_BUDGET_LLM_LIMIT,
            "ocr": settings.PROVIDER_BUDGET_OCR_LIMIT,
            "systemone": settings.PROVIDER_BUDGET_SYSTEMONE_LIMIT,
        }
    )


class SQLiteAttemptBudget:
    """Durable local attempt ledger with process-safe reservation transactions."""

    def __init__(self, path: Path, cycle_id: str, network_enabled: bool) -> None:
        self.path = Path(path)
        self.cycle_id = cycle_id
        self.network_enabled = bool(network_enabled)

    @staticmethod
    def _ensure_schema(connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS provider_budget_cycles (
                cycle_id TEXT PRIMARY KEY,
                llm_limit INTEGER NOT NULL,
                ocr_limit INTEGER NOT NULL,
                systemone_limit INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'closed')),
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS provider_attempts (
                attempt_id TEXT PRIMARY KEY,
                cycle_id TEXT NOT NULL,
                provider_slot TEXT NOT NULL,
                source_path TEXT NOT NULL,
                reserved_at TEXT NOT NULL,
                outcome TEXT NOT NULL DEFAULT 'reserved',
                reason_code TEXT,
                finished_at TEXT,
                FOREIGN KEY(cycle_id) REFERENCES provider_budget_cycles(cycle_id),
                CHECK(provider_slot IN ('llm', 'ocr', 'systemone')),
                CHECK(outcome IN ('reserved', 'succeeded', 'failed', 'blocked', 'output_rejected'))
            )
            """
        )
        attempt_schema = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'provider_attempts'"
        ).fetchone()
        if attempt_schema and "output_rejected" not in str(attempt_schema[0]).lower():
            # Preserve an existing local ledger created by the first remediation schema.
            connection.execute("DROP INDEX IF EXISTS provider_attempts_cycle_slot")
            connection.execute("ALTER TABLE provider_attempts RENAME TO provider_attempts_legacy")
            connection.execute(
                """
                CREATE TABLE provider_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    cycle_id TEXT NOT NULL,
                    provider_slot TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    reserved_at TEXT NOT NULL,
                    outcome TEXT NOT NULL DEFAULT 'reserved',
                    reason_code TEXT,
                    finished_at TEXT,
                    FOREIGN KEY(cycle_id) REFERENCES provider_budget_cycles(cycle_id),
                    CHECK(provider_slot IN ('llm', 'ocr', 'systemone')),
                    CHECK(outcome IN ('reserved', 'succeeded', 'failed', 'blocked', 'output_rejected'))
                )
                """
            )
            connection.execute(
                """
                INSERT INTO provider_attempts
                    (attempt_id, cycle_id, provider_slot, source_path, reserved_at, outcome, reason_code, finished_at)
                SELECT attempt_id, cycle_id, provider_slot, source_path, reserved_at, outcome, reason_code, finished_at
                FROM provider_attempts_legacy
                """
            )
            connection.execute("DROP TABLE provider_attempts_legacy")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS provider_attempts_cycle_slot "
            "ON provider_attempts(cycle_id, provider_slot)"
        )

    @staticmethod
    def _connect(path: Path) -> sqlite3.Connection:
        try:
            connection = sqlite3.connect(str(path), timeout=5.0, isolation_level=None)
            connection.execute("PRAGMA busy_timeout = 5000")
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA synchronous = NORMAL")
            return connection
        except (OSError, sqlite3.Error) as exc:
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc

    @classmethod
    def create_cycle(cls, path: Path, cycle_id: str, limits: Mapping[str, int]) -> None:
        cycle_id = _validate_cycle_id(cycle_id)
        normalized_limits = _validate_limits(limits)
        path = Path(path)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            connection = cls._connect(path)
        except ProviderBudgetError:
            raise
        try:
            connection.execute("BEGIN IMMEDIATE")
            cls._ensure_schema(connection)
            if connection.execute(
                "SELECT 1 FROM provider_budget_cycles WHERE cycle_id = ?",
                (cycle_id,),
            ).fetchone():
                raise ProviderBudgetError("provider_cycle_exists", "Provider attempt cycle already exists.")
            connection.execute(
                """
                INSERT INTO provider_budget_cycles
                    (cycle_id, llm_limit, ocr_limit, systemone_limit, status, created_at)
                VALUES (?, ?, ?, ?, 'active', ?)
                """,
                (
                    cycle_id,
                    normalized_limits["llm"],
                    normalized_limits["ocr"],
                    normalized_limits["systemone"],
                    _utc_now(),
                ),
            )
            connection.commit()
        except ProviderBudgetError:
            connection.rollback()
            raise
        except (OSError, sqlite3.Error) as exc:
            connection.rollback()
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc
        finally:
            connection.close()

    @classmethod
    def close_cycle(cls, path: Path, cycle_id: str) -> None:
        cycle_id = _validate_cycle_id(cycle_id)
        path = Path(path)
        if not path.exists():
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is unavailable.",
            )
        connection = cls._connect(path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            updated = connection.execute(
                "UPDATE provider_budget_cycles SET status = 'closed' WHERE cycle_id = ? AND status = 'active'",
                (cycle_id,),
            ).rowcount
            if updated != 1:
                raise ProviderBudgetError("provider_cycle_missing", "Provider attempt cycle is not active.")
            connection.commit()
        except ProviderBudgetError:
            connection.rollback()
            raise
        except (OSError, sqlite3.Error) as exc:
            connection.rollback()
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc
        finally:
            connection.close()

    @staticmethod
    def ensure_network_enabled(network_enabled: bool | None = None) -> None:
        """Fail closed before reservation and again immediately before transport."""
        if network_enabled is None:
            from config import settings

            network_enabled = settings.PROVIDER_NETWORK_ENABLED
        if not network_enabled:
            raise ProviderBudgetError(
                "provider_network_disabled",
                "Live provider network access is disabled.",
            )

    def reserve(self, provider_slot: str, source_path: str) -> AttemptReservation:
        # This check must happen before touching SQLite so offline mode consumes no state.
        self.ensure_network_enabled(self.network_enabled)
        if provider_slot not in PROVIDER_SLOTS:
            raise ProviderBudgetError("provider_slot_invalid", "Provider slot is invalid.")
        if source_path not in SOURCE_PATHS:
            raise ProviderBudgetError("provider_source_invalid", "Provider source path is invalid.")
        cycle_id = _validate_cycle_id(self.cycle_id)
        if not self.path.exists():
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is unavailable.",
            )

        connection = self._connect(self.path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            self._ensure_schema(connection)
            row = connection.execute(
                """
                SELECT status, llm_limit, ocr_limit, systemone_limit
                FROM provider_budget_cycles
                WHERE cycle_id = ?
                """,
                (cycle_id,),
            ).fetchone()
            if row is None:
                raise ProviderBudgetError(
                    "provider_cycle_missing",
                    "Provider attempt cycle is not initialized.",
                )
            if row[0] != "active":
                raise ProviderBudgetError(
                    "provider_cycle_inactive",
                    "Provider attempt cycle is not active.",
                )
            limit = int(row[1 + PROVIDER_SLOTS.index(provider_slot)])
            used = connection.execute(
                "SELECT COUNT(*) FROM provider_attempts WHERE cycle_id = ? AND provider_slot = ?",
                (cycle_id, provider_slot),
            ).fetchone()[0]
            if used >= limit:
                raise ProviderBudgetError(
                    "provider_budget_exhausted",
                    "Provider attempt budget is exhausted.",
                )
            attempt_id = uuid.uuid4().hex
            connection.execute(
                """
                INSERT INTO provider_attempts
                    (attempt_id, cycle_id, provider_slot, source_path, reserved_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (attempt_id, cycle_id, provider_slot, source_path, _utc_now()),
            )
            connection.commit()
            return AttemptReservation(attempt_id, cycle_id, provider_slot, source_path)
        except ProviderBudgetError:
            connection.rollback()
            raise
        except (OSError, sqlite3.Error) as exc:
            connection.rollback()
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc
        finally:
            connection.close()

    def finish(self, reservation: AttemptReservation, outcome: str, reason_code: str | None = None) -> None:
        if outcome not in _OUTCOMES:
            raise ProviderBudgetError("provider_outcome_invalid", "Provider attempt outcome is invalid.")
        if reason_code is not None and not re.fullmatch(r"[a-z][a-z0-9_.-]{0,79}", reason_code):
            raise ProviderBudgetError("provider_reason_invalid", "Provider attempt reason is invalid.")
        connection = self._connect(self.path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            updated = connection.execute(
                """
                UPDATE provider_attempts
                SET outcome = ?, reason_code = ?, finished_at = ?
                WHERE attempt_id = ? AND cycle_id = ? AND outcome = 'reserved'
                """,
                (outcome, reason_code, _utc_now(), reservation.attempt_id, reservation.cycle_id),
            ).rowcount
            if updated != 1:
                raise ProviderBudgetError("provider_attempt_missing", "Provider attempt is not writable.")
            connection.commit()
            _LAST_ATTEMPT.set(
                AttemptReceipt(
                    reservation.attempt_id,
                    reservation.cycle_id,
                    reservation.provider_slot,
                    reservation.source_path,
                    outcome,
                    reason_code,
                )
            )
        except ProviderBudgetError:
            connection.rollback()
            raise
        except (OSError, sqlite3.Error) as exc:
            connection.rollback()
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc
        finally:
            connection.close()

    def amend_output_rejection(
        self,
        receipt: AttemptReceipt,
        reason_code: str,
    ) -> AttemptReceipt:
        if not re.fullmatch(r"[a-z][a-z0-9_.-]{0,79}", reason_code):
            raise ProviderBudgetError("provider_reason_invalid", "Provider attempt reason is invalid.")
        connection = self._connect(self.path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            updated = connection.execute(
                """
                UPDATE provider_attempts
                SET outcome = 'output_rejected', reason_code = ?, finished_at = ?
                WHERE attempt_id = ? AND cycle_id = ? AND outcome = 'succeeded'
                """,
                (reason_code, _utc_now(), receipt.attempt_id, receipt.cycle_id),
            ).rowcount
            if updated != 1:
                row = connection.execute(
                    "SELECT outcome, reason_code FROM provider_attempts WHERE attempt_id = ? AND cycle_id = ?",
                    (receipt.attempt_id, receipt.cycle_id),
                ).fetchone()
                if row and row[0] == "output_rejected":
                    return AttemptReceipt(
                        receipt.attempt_id,
                        receipt.cycle_id,
                        receipt.provider_slot,
                        receipt.source_path,
                        row[0],
                        row[1],
                    )
                raise ProviderBudgetError("provider_attempt_missing", "Provider attempt is not writable.")
            connection.commit()
            result = AttemptReceipt(
                receipt.attempt_id,
                receipt.cycle_id,
                receipt.provider_slot,
                receipt.source_path,
                "output_rejected",
                reason_code,
            )
            _LAST_ATTEMPT.set(result)
            return result
        except ProviderBudgetError:
            connection.rollback()
            raise
        except (OSError, sqlite3.Error) as exc:
            connection.rollback()
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc
        finally:
            connection.close()

    def snapshot(self, cycle_id: str | None = None) -> dict[str, int | str]:
        selected_cycle = _validate_cycle_id(cycle_id or self.cycle_id)
        if not self.path.exists():
            raise ProviderBudgetError("provider_budget_unavailable", "Provider attempt budget is unavailable.")
        connection = self._connect(self.path)
        try:
            row = connection.execute(
                """
                SELECT llm_limit, ocr_limit, systemone_limit, status
                FROM provider_budget_cycles
                WHERE cycle_id = ?
                """,
                (selected_cycle,),
            ).fetchone()
            if row is None:
                raise ProviderBudgetError("provider_cycle_missing", "Provider attempt cycle is not initialized.")
            result: dict[str, int | str] = {
                "cycle_id": selected_cycle,
                "status": row[3],
            }
            for index, slot in enumerate(PROVIDER_SLOTS):
                result[f"{slot}_limit"] = int(row[index])
                result[f"{slot}_used"] = int(
                    connection.execute(
                        "SELECT COUNT(*) FROM provider_attempts WHERE cycle_id = ? AND provider_slot = ?",
                        (selected_cycle, slot),
                    ).fetchone()[0]
                )
            return result
        except ProviderBudgetError:
            raise
        except (OSError, sqlite3.Error) as exc:
            raise ProviderBudgetError(
                "provider_budget_unavailable",
                "Provider attempt budget is temporarily unavailable.",
            ) from exc
        finally:
            connection.close()


def configured_attempt_budget() -> SQLiteAttemptBudget:
    from config import settings

    return SQLiteAttemptBudget(
        Path(settings.PROVIDER_BUDGET_PATH),
        settings.PROVIDER_BUDGET_CYCLE_ID,
        settings.PROVIDER_NETWORK_ENABLED,
    )


def create_configured_cycle(cycle_id: str) -> None:
    from config import settings

    SQLiteAttemptBudget.ensure_network_enabled()
    if settings.PROVIDER_BUDGET_CYCLE_ID != cycle_id:
        raise ProviderBudgetError(
            "provider_cycle_not_configured",
            "Provider attempt cycle does not match server configuration.",
        )
    SQLiteAttemptBudget.create_cycle(
        Path(settings.PROVIDER_BUDGET_PATH),
        cycle_id,
        configured_attempt_limits(),
    )


def close_configured_cycle(cycle_id: str) -> None:
    from config import settings

    SQLiteAttemptBudget.close_cycle(Path(settings.PROVIDER_BUDGET_PATH), cycle_id)


def reserve_provider_attempt(provider_slot: str, source_path: str) -> AttemptReservation:
    return configured_attempt_budget().reserve(provider_slot, source_path)


def finish_provider_attempt(
    reservation: AttemptReservation,
    outcome: str,
    reason_code: str | None = None,
) -> None:
    configured_attempt_budget().finish(reservation, outcome, reason_code)


def amend_provider_output_rejection(receipt: AttemptReceipt, reason_code: str) -> AttemptReceipt:
    return configured_attempt_budget().amend_output_rejection(receipt, reason_code)


def last_provider_attempt() -> AttemptReceipt | None:
    """Return only system-generated metadata for the current async task."""
    return _LAST_ATTEMPT.get()


def clear_last_provider_attempt() -> None:
    """Prevent a prior provider call in the same task from being misattributed."""
    _LAST_ATTEMPT.set(None)
