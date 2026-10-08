"""Fixed instruction profiles. No customer path, executable code or agent-kit loading."""
import hashlib
import json
from pathlib import Path

from services.conversation_transport import ConversationError

ROOT = Path(__file__).resolve().parents[1] / 'runtime_skills/thai_health'
PROFILES = {'general': ('core.md', 'thai-style.md', 'package-advice.md'),
            'medical': ('core.md', 'thai-style.md', 'patient-explanation.md')}


def bundle(profile):
    if profile not in PROFILES:
        raise ConversationError('skill_invalid', 'Unknown instruction profile.')
    try:
        manifest = json.loads((ROOT / 'manifest.json').read_text())
        texts = []
        for name in PROFILES[profile]:
            path = (ROOT / name).resolve(strict=True)
            if path.parent != ROOT.resolve() or path.stat().st_size > 65536:
                raise ValueError
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != manifest['modules'][name]:
                raise ValueError
            texts.append(raw.decode('utf-8').strip())
        instructions = '\n\n'.join(texts)
        return {'id': manifest['id'], 'version': manifest['version'], 'profile': profile,
                'sha256': hashlib.sha256(instructions.encode()).hexdigest(), 'instructions': instructions}
    except (OSError, ValueError, KeyError, UnicodeError):
        raise ConversationError('skill_invalid', 'Runtime instructions failed integrity validation.') from None
