"""Server-owned presentation choices. Never add capabilities or clinical facts."""
from typing import Literal
Tone = Literal['professional', 'normal', 'playful']
STYLES = {
    'professional': 'Polite, structured explanation. Define medical terms and state uncertainty clearly.',
    'normal': 'Plain, step-by-step explanation for a reader without medical training. Use a concrete example when useful.',
    'playful': 'Warm, casual wording with an optional gentle analogy or light nonclinical wordplay. Clarity comes first.',
}
RULE = ('Presentation only: preserve the same clinical facts, exact numbers and units, citations, uncertainty and safety thresholds in every tone. '
        'Never diagnose, prescribe or relax evidence checks. Suppress all humor for alarming results, severe symptoms, emergencies or sensitive personal suffering. '
        'Do not request personal details just to satisfy a style choice. Use the requested language consistently.')

def selected(value):
    tone = value if isinstance(value, str) and value in STYLES else 'normal'
    return {'tone': tone, 'instruction': STYLES[tone], 'invariants': RULE}
