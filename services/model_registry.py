"""Candidate metadata, separate from saved runtime providers and permission to call."""
import json
from pathlib import Path


def registry():
    return json.loads((Path(__file__).resolve().parents[1] / 'runtime_skills/model_registry.json').read_text())


def supports_response_format(model):
    record = next((row for row in registry()['models'] if row['model_id'] == model), None)
    return record is None or record['response_format'] is True
