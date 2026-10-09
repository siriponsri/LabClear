"""Reviewed runtime instruction modules, selected per task. No customer path, executable code or agent-kit loading.

The application decides which modules a turn needs from server facts (the answering role's
capabilities, the planned action, whether a confirmed report is present, the classes of evidence
loaded and the typed tools that ran). Model output, user text and documents can never name a
module, install one or change policy. Each module has an ID, version and SHA-256 in manifest.json,
plus a role-capability allowlist: package modules only reach roles that may quote, and the patient
explanation only reaches roles that read a confirmed report.

``bundle(profile)`` keeps the 0.2 whole-profile behaviour for callers and tests that still use it.
"""
import hashlib
import json
from pathlib import Path

from services.conversation_transport import ConversationError

ROOT = Path(__file__).resolve().parents[1] / 'runtime_skills/thai_health'
PROFILES = {'general': ('core.md', 'thai-style.md', 'package-advice.md'),
            'medical': ('core.md', 'thai-style.md', 'patient-explanation.md')}
ORDER = ('core.md', 'thai-style.md', 'evidence-citation.md', 'scope-uncertainty.md', 'lay-explanation.md',
         'patient-explanation.md', 'package-advice.md', 'package-compare.md')
MEDICAL = {'public_reference', 'public_education'}


def _manifest():
    return json.loads((ROOT / 'manifest.json').read_text())


def _read(name, manifest):
    path = (ROOT / name).resolve(strict=True)
    if path.parent != ROOT.resolve() or path.stat().st_size > 65536:
        raise ValueError
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest['modules'][name]:
        raise ValueError
    return raw.decode('utf-8').strip()


def bundle(profile):
    if profile not in PROFILES:
        raise ConversationError('skill_invalid', 'Unknown instruction profile.')
    try:
        manifest = _manifest()
        instructions = '\n\n'.join(_read(name, manifest) for name in PROFILES[profile])
        return {'id': manifest['id'], 'version': manifest['version'], 'profile': profile,
                'sha256': hashlib.sha256(instructions.encode()).hexdigest(), 'instructions': instructions}
    except (OSError, ValueError, KeyError, UnicodeError):
        raise ConversationError('skill_invalid', 'Runtime instructions failed integrity validation.') from None


def _allowed(meta, role):
    need = meta.get('requires') or {}
    if need.get('actions_any') and not set(need['actions_any']) & set(role.get('actions', [])):
        return False
    if need.get('reads_any') and not set(need['reads_any']) & set(role.get('reads', [])):
        return False
    return True


def wanted(role, action, has_report, evidence_classes, tools):
    """Which modules this task needs, with the reason for each (shown in checks.skills)."""
    business = 'synthetic_business' in evidence_classes
    medical = bool(MEDICAL & set(evidence_classes))
    rules = {
        'core.md': 'always',
        'thai-style.md': 'always (Thai-first service; the module defers to an explicit language request)',
        'evidence-citation.md': 'evidence loaded' if evidence_classes else '',
        'scope-uncertainty.md': 'medical evidence, a report or an urgent/clarifying action' if (medical or has_report or action in ('urgent', 'clarify')) else '',
        'lay-explanation.md': 'medical evidence without a confirmed report' if (medical and not has_report) else '',
        'patient-explanation.md': 'confirmed report' if has_report else '',
        'package-advice.md': 'catalog evidence for a role that may quote' if business and 'catalog' in role.get('reads', []) else '',
        'package-compare.md': 'deterministic comparison table' if 'compare_packages' in tools else '',
    }
    return {name: reason for name, reason in rules.items() if reason}


def select(role, action, has_report, evidence_classes, tools=()):
    """Bundle only the modules this task needs and this role may receive."""
    try:
        manifest = _manifest()
        meta = manifest.get('module_meta', {})
        reasons = wanted(role, action, has_report, set(evidence_classes), set(tools))
        chosen, skipped = [], {}
        for name in ORDER:
            if name not in reasons:
                continue
            if name not in meta or not _allowed(meta[name], role):
                skipped[name] = 'role not allowed'
                continue
            chosen.append(name)
        texts = [_read(name, manifest) for name in chosen]
        instructions = '\n\n'.join(texts)
        return {'id': manifest['id'], 'version': manifest['version'], 'instructions': instructions,
                'sha256': hashlib.sha256(instructions.encode()).hexdigest(),
                'modules': [{'file': n, 'id': meta[n]['id'], 'version': meta[n]['version'], 'sha256': manifest['modules'][n][:16],
                             'reason': reasons[n]} for n in chosen],
                'skipped': skipped}
    except (OSError, ValueError, KeyError, UnicodeError):
        raise ConversationError('skill_invalid', 'Runtime instructions failed integrity validation.') from None
