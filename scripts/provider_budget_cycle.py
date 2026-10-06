"""Explicitly create, close, or inspect the configured local provider cycle.

This command never creates a cycle implicitly. The cycle ID and limits come
from server-side settings, and creation requires the explicit network opt-in.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.provider_budget import (
    ProviderBudgetError,
    close_configured_cycle,
    configured_attempt_budget,
    create_configured_cycle,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("create", "close", "snapshot"))
    args = parser.parse_args()
    try:
        if args.action == "create":
            cycle_id = configured_attempt_budget().cycle_id
            create_configured_cycle(cycle_id)
            result = {"status": "created", "cycle_id": cycle_id}
        elif args.action == "close":
            cycle_id = configured_attempt_budget().cycle_id
            close_configured_cycle(cycle_id)
            result = {"status": "closed", "cycle_id": cycle_id}
        else:
            result = configured_attempt_budget().snapshot()
    except ProviderBudgetError as exc:
        print(json.dumps({"status": "error", "code": exc.code}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
