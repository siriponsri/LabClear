"""Shared test configuration.

Legacy provider-transport tests exercise mocked HTTP with the network flag enabled.
They predate the THB cost ledger and do not configure a database or price table, so
the ledger is disabled for them by default. Ledger behaviour is tested explicitly in
tests/test_cost_ledger.py with the `cost_ledger` marker, which keeps it enabled.
"""
import pytest
from config import settings


@pytest.fixture(autouse=True)
def _cost_ledger_scope(request, monkeypatch):
    if request.node.get_closest_marker("cost_ledger") is None:
        monkeypatch.setattr(settings, "COST_LEDGER_ENABLED", False)
