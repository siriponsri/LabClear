"""Enumerate every realistic answer route and compare runtime-skill selection: 0.2 whole profile vs 0.3 per task.

    python scripts/skill_route_matrix.py [--out docs/evidence/free-first/skill-route-matrix.json]

No model call. The 0.2 behaviour is reproduced exactly as business_agent used it before commit 599f407:
bundle('medical' if a confirmed report is present else 'general') for every message. The routes are
the answering roles in business_data/dots.json with the evidence they can receive. Live round 2
(docs/evidence/round2/course_eval_results.json, Q09) shows the Report Explainer answering a knowledge
question without a report, so that route is real, not hypothetical.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out")
    args = ap.parse_args(argv)
    from services import runtime_skills
    roles = {d["id"]: d for d in json.loads((ROOT / "business_data/dots.json").read_text(encoding="utf-8"))["dots"]}
    routes = []
    for role in roles.values():
        reads, can_quote = set(role["reads"]), "quote" in role["actions"]
        business = bool(reads & {"catalog", "branches", "policies"})
        for has_report in ([False, True] if "report" in reads else [False]):
            for medical in ([False, True] if "medical" in reads else [False]):
                for compare in ([False, True] if (can_quote and "catalog" in reads) else [False]):
                    evidence = ({"synthetic_business"} if business else set()) | ({"public_reference"} if medical else set())
                    tools = ["compare_packages"] if compare else []
                    old = runtime_skills.bundle("medical" if has_report else "general")
                    old_files = list(runtime_skills.PROFILES["medical" if has_report else "general"])
                    new = runtime_skills.select(role, "answer", has_report, evidence, tools)
                    new_files = [m["file"] for m in new["modules"]]
                    def violations(files):
                        out = []
                        if not can_quote and {"package-advice.md", "package-compare.md"} & set(files):
                            out.append("sales module for a role that cannot quote")
                        if "report" not in reads and "patient-explanation.md" in files:
                            out.append("report module for a role that cannot read reports")
                        if medical and not has_report and "patient-explanation.md" not in files and "lay-explanation.md" not in files:
                            out.append("no explanation guidance for a medical question")
                        if compare and "package-compare.md" not in files:
                            out.append("comparison table without comparison guidance")
                        return out
                    routes.append({"role": role["id"], "has_report": has_report, "medical_evidence": medical, "compare_tool": compare,
                                   "v0_2": {"modules": old_files, "chars": len(old["instructions"]), "violations": violations(old_files)},
                                   "v0_3": {"modules": new_files, "chars": len(new["instructions"]), "violations": violations(new_files)}})
    summary = {"routes": len(routes),
               "v0_2_routes_with_violations": sum(1 for r in routes if r["v0_2"]["violations"]),
               "v0_3_routes_with_violations": sum(1 for r in routes if r["v0_3"]["violations"]),
               "v0_2_mean_chars": round(sum(r["v0_2"]["chars"] for r in routes) / len(routes)),
               "v0_3_mean_chars": round(sum(r["v0_3"]["chars"] for r in routes) / len(routes))}
    out = {"summary": summary, "routes": routes}
    text = json.dumps(out, ensure_ascii=False, indent=1)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=1))
    for r in routes:
        print(f"{r['role']:<10} report={r['has_report']!s:<5} medical={r['medical_evidence']!s:<5} compare={r['compare_tool']!s:<5} "
              f"0.2 {len(r['v0_2']['violations'])} viol {r['v0_2']['chars']:>5} chars | 0.3 {len(r['v0_3']['violations'])} viol {r['v0_3']['chars']:>5} chars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
