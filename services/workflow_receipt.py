"""Per-request receipts: public source fingerprints and the existing ledger charge.

Never include prompts, report values, credentials, private source IDs or global spend.
This is trace evidence, not proof that an answer is medically correct.
"""
import hashlib

PUBLIC = frozenset({"public_reference", "public_education", "synthetic_business", "official_external"})


def source_manifest(records):
    return [{"id": str(r["id"]), "data_class": r["data_class"],
             "content_sha256": hashlib.sha256(str(r.get("content", "")).encode("utf-8")).hexdigest()}
            for r in records if r.get("data_class") in PUBLIC]


def receipt(ctx):
    return {"schema": "workflow-receipt-1", "provider_attempts": ctx.attempts,
            "reserved_estimate_thb": round(ctx.receipt_reserved_thb, 6),
            "settled_estimate_thb": round(ctx.receipt_settled_thb, 6),
            "cost_basis": "existing_ledger_estimate_not_provider_invoice",
            "ledger_enabled": ctx.receipt_ledger_enabled,
            "public_writer_sources": ctx.receipt_sources}
