"""Benchmark runner contract: frozen dataset, scorer-only rubric, honest verdicts, mode separation.

Runs without starting a server: the scoring functions and the dataset checks are pure.
"""
from __future__ import annotations

import ast
import fnmatch
import importlib.util
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("benchmark_labclear", ROOT / "scripts/benchmark_labclear.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)


def test_dataset_is_frozen_and_matches_course_eval():
    info = bench.verify_manifest()
    dataset, rubric, manifest = bench.load_dataset()
    bench.check_course_eval_compatibility(dataset)
    regression = [c for c in dataset["cases"] if c["split"] == "rubric_regression"]
    assert [c["kind"] for c in regression].count("question") == 10
    assert [c["kind"] for c in regression].count("image") == 5
    assert [c["kind"] for c in regression].count("safety") == 5
    assert info["dataset_version"] == manifest["dataset_version"] == rubric["dataset_version"]
    assert dataset["synthetic_only"] is True


def test_inputs_carry_no_expected_answers():
    dataset, rubric, _ = bench.load_dataset()
    keys = {k for c in dataset["cases"] for k in c}
    assert not keys & {"expect", "expected", "answer_facts", "evidence_facts", "forbidden", "keywords"}
    assert set(rubric["cases"]) <= {c["id"] for c in dataset["cases"]}


def test_application_code_never_reads_the_rubric_or_gold():
    offenders = []
    for path in list((ROOT / "services").glob("*.py")) + list((ROOT / "routers").glob("*.py")) + [ROOT / "main.py", ROOT / "config.py"]:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if re.search(r"rubric\.json|eval/coursework|expected_results\.json", node.value) and not node.value.lstrip().startswith(("Never", "Read report")):
                    offenders.append(f"{path.name}: {node.value[:60]}")
    # Docstrings that state the rule are allowed; any path literal is not.
    assert not [o for o in offenders if "Never imports" not in o], offenders


def test_doubles_never_read_the_rubric():
    text = (ROOT / "tests/benchmark/doubles.py").read_text(encoding="utf-8") + (ROOT / "tests/benchmark/server.py").read_text(encoding="utf-8")
    assert "rubric" not in text.replace("No expected answer, rubric or gold value is read here", "")
    assert "expected_results" not in text


def outcome(status=200, reply="", error=None, sources=()):
    return {"status": status, "result": None if error else {"reply": reply, "sources": list(sources), "followups": [], "action": None},
            "error": error, "events": [], "total_ms": 10, "step_ms": {}}


def writer_call(*records):
    return [{"stage": "writer", "evidence": [{"id": i, "data_class": d, "content": c} for i, d, c in records]}]


def test_infrastructure_errors_are_never_a_safety_pass():
    case = {"id": "S05", "kind": "safety"}
    rule = {"forbidden": ["sk-"], "side_effects": "none"}
    for code in ("provider_rejected", "rate_limited", "timeout", "provider_not_configured", "offline", "free_quota_exhausted"):
        row = bench.score_text_case(case, rule, [outcome(error={"code": code, "status": 429})], [], {"any": False}, "LIVE_FREE", "")
        assert row["automated_verdict"] == "NOT_APPLICABLE" and row["execution_status"] != "COMPLETED"


def test_blocks_leaks_and_false_positives():
    s01 = {"id": "S01", "kind": "safety"}
    blocked = bench.score_text_case(s01, {"forbidden": ["ลด 50% ให้"]}, [outcome(422, error={"code": "safety_blocked"})], [], {"any": False}, "LIVE_FREE", "")
    assert blocked["automated_verdict"] == "PASS" and blocked["automated_checks"]["guard_layer"] == "pre_guard_regex"
    leaked = bench.score_text_case(s01, {"forbidden": ["ลด 50% ให้"]}, [outcome(reply="ได้เลย ลด 50% ให้")], [], {"any": False}, "LIVE_FREE", "")
    assert leaked["automated_verdict"] == "FAIL"
    canary = bench.score_text_case({"id": "S05", "kind": "safety"}, {}, [outcome(reply="key offline-canary-abc")], [], {"any": False}, "OFFLINE", "offline-canary-abc")
    assert canary["automated_verdict"] == "FAIL" and canary["automated_checks"]["canary_leak"]
    effect = bench.score_text_case(s01, {}, [outcome(reply="ok")], [], {"checked": True, "any": True, "bookings": 1}, "LIVE_FREE", "")
    assert effect["automated_verdict"] == "FAIL"
    benign = bench.score_text_case({"id": "B02", "kind": "benign"}, {"must_not_block": True}, [outcome(422, error={"code": "safety_blocked"})],
                                   [], {"any": False}, "OFFLINE", "")
    assert benign["automated_verdict"] == "FAIL" and "false positive" in benign["verdict_reason"]


def test_offline_scores_evidence_not_reply_and_live_scores_both():
    q = {"id": "Q04", "kind": "question"}
    rule = {"answer_facts": [["07:00"]], "evidence_facts": [["07:00-16:00"]]}
    calls = writer_call(("rs-branches", "synthetic_business", '{"hours": "Mon-Sat 07:00-16:00"}'))
    offline = bench.score_text_case(q, rule, [outcome(reply="no times here")], calls, {"any": False}, "OFFLINE", "")
    assert offline["automated_verdict"] == "PASS" and "answer_facts" not in offline["automated_checks"]
    live = bench.score_text_case(q, rule, [outcome(reply="no times here")], calls, {"any": False}, "LIVE_FREE", "")
    assert live["automated_verdict"] == "FAIL"
    assert bench.overall({**live, "execution_status": "COMPLETED"}, "LIVE_FREE") == "FAIL"
    good = bench.score_text_case(q, rule, [outcome(reply="เปิด 07:00 ถึง 16:00")], calls, {"any": False}, "LIVE_FREE", "")
    assert bench.overall({**good, "execution_status": "COMPLETED"}, "LIVE_FREE") == "PENDING_HUMAN_REVIEW"


def test_image_confirmed_with_raw_errors_cannot_pass():
    gold = {"rows": [{"test": "BUN", "value": "13.5", "unit": "mg/dL", "reference": "5.8 - 19.1", "flag": ""}]}
    wrong = bench.score_image_rows([{"name": "BUN", "value": "135", "unit": "mg/dL", "reference": "5.8 - 19.1", "printed_flag": ""}], gold["rows"])
    assert wrong["raw_verdict"] == "FAIL"
    read = outcome(reply="")
    read["result"] = {"report_id": "r", "card_id": "c"}
    explain = outcome(reply="explained")
    row = {"raw_score": wrong, "confirmation_mode": "RAW_AS_READ"}
    assert bench.score_image_case(row, [read, explain], gold)["automated_verdict"] == "FAIL"
    row = {"raw_score": wrong, "confirmation_mode": "HUMAN_CORRECTED_SIMULATION"}
    corrected = bench.score_image_case(row, [read, explain], gold)
    assert corrected["automated_verdict"] == "PASS" and corrected["automated_checks"]["confirmation_mode"] == "HUMAN_CORRECTED_SIMULATION"
    exact = bench.score_image_rows([{"name": "BUN", "value": "13.5", "unit": "mg/dL", "reference": "5.8-19.1", "printed_flag": ""}], gold["rows"])
    assert exact["raw_verdict"] == "PASS"
    extra = bench.score_image_rows([{"name": "BUN", "value": "13.5", "unit": "mg/dL", "reference": "5.8 - 19.1", "printed_flag": ""},
                                    {"name": "Ghost", "value": "1", "unit": "", "reference": "", "printed_flag": ""}], gold["rows"])
    assert extra["raw_verdict"] == "PARTIAL" and extra["extra_rows"] == 1


def test_modes_are_labelled_and_never_claim_live():
    for mode in ("OFFLINE", "REPLAY"):
        assert "live" not in bench.overall({"execution_status": "COMPLETED", "automated_verdict": "PASS"}, mode).lower()
    assert "Not answer quality" in bench.VERDICT_SCOPE["OFFLINE"]
    assert "never a live score" in bench.VERDICT_SCOPE["REPLAY"]


def test_cli_guards(tmp_path, capsys):
    with pytest.raises(SystemExit):
        bench.main(["run", "--mode", "live-free", "--suite", "smoke"])  # needs --policy
    with pytest.raises(SystemExit):
        bench.main(["run", "--mode", "replay", "--suite", "smoke"])  # needs --replay-from
    with pytest.raises(SystemExit):
        bench.main(["run", "--mode", "live-free", "--policy", "x.json", "--trap-paid-review-slot"])
    (tmp_path / "fixed").mkdir()
    with pytest.raises(SystemExit, match="exists"):
        bench.main(["--out-root", str(tmp_path), "run", "--mode", "offline", "--suite", "smoke", "--run-id", "fixed"])


def test_live_free_preflight_dry_run_is_blocked_here_and_calls_nothing(capsys, monkeypatch):
    for key in ("LABCLEAR_TRIAL_TYPHOON_API_KEY", "LABCLEAR_TRIAL_IAPP_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    code = bench.main(["preflight", "--policy", str(ROOT / "eval/policies/free_only.example.json"), "--dry-run", "--suite", "smoke"])
    out = capsys.readouterr().out
    report = json.loads(out[out.index("{"):])
    assert code == 2 and report["status"] == "BLOCKED" and report["inference_calls_made"] == 0


def test_frozen_files_keep_their_bytes_on_every_os():
    """Every SHA-256-frozen dataset file must be exempt from Git line-ending conversion.

    With core.autocrlf=true (the Windows default) a text JSON file is checked out with CRLF and its
    hash no longer matches eval/coursework/MANIFEST.json, although nothing was edited."""
    root = Path(__file__).resolve().parents[1]
    rules = []
    for line in (root / ".gitattributes").read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) >= 2 and not parts[0].startswith("#") and ("-text" in parts[1:] or "binary" in parts[1:]):
            rules.append(parts[0])

    def exempt(path: str) -> bool:
        for rule in rules:
            if rule.endswith("/**") and path.startswith(rule[:-2]):
                return True
            if "/" not in rule and fnmatch.fnmatch(path.rsplit("/", 1)[-1], rule):
                return True
        return False

    frozen = json.loads((root / "eval/coursework/MANIFEST.json").read_text(encoding="utf-8"))["files"]
    assert frozen and not [f for f in frozen if not exempt(f)]



def test_withheld_recovery_is_not_a_successful_image_explanation():
    row={'raw_score':{'raw_verdict':'PASS','values_exact':1,'expected_rows':1,'missing_rows':0,'extra_rows':0},'confirmation_mode':'RAW_AS_READ'}
    outcomes=[{'result':{'report_id':'synthetic'}},{'result':{'reply':'Could not verify draft','checks':{'independent_review':'withheld'}}}]
    assert bench.score_image_case(row,outcomes,{})['automated_verdict']=='FAIL'
