"""Static publication-scope and evidence checks against the explicitly staged candidate.

Run after selective staging; no credentials, database access, network or staging mutation.
Writes a manifest for later inclusion in the candidate. Not a substitute for diff review.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'b95621f45da55cba88f70fe62bac796a994bf0ba'
TARGET = 'docs/ceo-upgrade/evidence/candidate-manifest.json'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def run():
    assert git('branch', '--show-current').decode().strip() == 'main'
    paths = git('diff', '--cached', '--name-only', BASE, '-z').decode().strip('\x00').split('\x00')
    assert paths and paths != [''], 'Stage a concrete candidate first'
    forbidden = ['docs/ceo-upgrade/intake-', '.env', 'data/', 'node_modules/', '.venv/', 'static/fonts/', 'static/vendor/']
    sensitive = re.compile(rb'(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})')
    rows = []
    for name in paths:
        assert name not in {'course_eval_round4.json', 'LABCLEAR_CEO_UPGRADE_TASK.md'}, name
        assert not any(name.startswith(prefix) for prefix in forbidden), name
        assert Path(name).suffix.lower() not in {'.sqlite', '.sqlite3', '.db', '.key', '.zip', '.bundle', '.woff', '.woff2'}, name
        if name == TARGET:
            continue
        raw = git('show', ':' + name)
        if Path(name).suffix.lower() != '.png':
            assert not sensitive.search(raw), 'Potential secret in ' + name
        # Normalize worktree text exactly as Git would before comparing bytes.
        staged_oid = git('rev-parse', ':' + name).decode().strip()
        working_oid = git('hash-object', '--path=' + name, name).decode().strip()
        assert staged_oid == working_oid, 'Unstaged change after evidence: ' + name
        rows.append({'path': name, 'bytes': len(raw), 'sha256': sha(raw), 'git_blob': staged_oid})
    protected = ROOT / 'course_eval_round4.json'
    assert sha(protected.read_bytes()) == '1f37d206692524b9ce06ba2fb179506be7c7a8bcecc580be4504bff87dbb39d2'
    evidence = ROOT / 'docs/ceo-upgrade/evidence'
    suite = ET.parse(evidence / 'candidate-pytest.xml').getroot().find('testsuite')
    assert int(suite.attrib['tests']) >= 265 and all(int(suite.attrib[k]) == 0 for k in ('failures', 'errors', 'skipped'))
    legacy = json.loads((evidence / 'legacy-browser/browser-uat.json').read_text())
    assert legacy['passed'] == 36 and legacy['failed'] == 0 and not legacy['errors']
    browser = json.loads((evidence / 'browser/upgrade-browser.json').read_text())
    scenarios = [r for r in browser['records'] if 'status' in r]
    assert len(scenarios) == 10 and all(r['status'] == 'PASS' for r in scenarios) and not browser['browserErrors']
    for name in browser['screenshots']:
        assert (evidence / 'browser' / name).is_file()
    evaluation = json.loads((evidence / 'offline-evaluation.json').read_text(encoding='utf-8'))
    assert len(evaluation['cases']) == 60 and evaluation['live_api_status'] == 'NOT_RUN'
    assert all(r['schema_and_fact_lock'] == 'PASS' and r['mutated_value_rejected'] for r in evaluation['cases'])
    assert json.loads((evidence / 'boot.json').read_text())['status'] == 'PASS'
    source_rows = [r for r in rows if not r['path'].startswith('docs/') and r['path'] != 'README.md']
    result = {'baseline': BASE, 'precommit_head': git('rev-parse', 'HEAD').decode().strip(),
              'source_digest_sha256': sha(json.dumps(source_rows, sort_keys=True).encode()),
              'digest_scope': 'Changed staged source/config/test bytes; unchanged files inherited from baseline. Documentation/evidence excluded from source digest. Git normalizes text line endings.',
              'evidence_link': 'Tests ran on working tree at baseline HEAD. Reviewed staged blobs equal Git-normalized working files; this manifest binds those bytes to the candidate commit.',
              'checks': {'python_passed': int(suite.attrib['tests']), 'legacy_browser_passed': 36,
                         'upgrade_browser_passed': 10, 'fixture_checks': 60, 'boot': 'PASS',
                         'owner_file_preserved': True, 'high_specificity_secret_scan': 'PASS',
                         'live_api': 'NOT_RUN', 'production_database': 'NOT_RUN'},
              'files': rows, 'manifest_excludes_itself': True}
    (ROOT / TARGET).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'PASS: {len(rows)} staged files; source digest {result["source_digest_sha256"]}; evidence and owner hash verified.')


if __name__ == '__main__':
    run()
