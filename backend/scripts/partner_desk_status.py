#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.partner_desk import PARTNER_DESK_ROOT, conversation_integrity_status  # noqa: E402


def main() -> int:
    conversation_dir = PARTNER_DESK_ROOT / "conversations"
    summaries: list[dict] = []
    failures: list[dict] = []
    if conversation_dir.exists():
        for path in sorted(conversation_dir.glob("cpd_*.jsonl")):
            conversation_id = path.stem
            try:
                summaries.append(conversation_integrity_status(conversation_id))
            except Exception as exc:
                failures.append({"conversation_id": conversation_id, "error": type(exc).__name__})
    report = {
        "schema_version": "chetana.partner_desk_status.v1",
        "status": "pass" if not failures else "fail",
        "conversation_count": len(summaries),
        "approval_queue_count": sum(bool(item["approval_required"]) for item in summaries),
        "approval_unreviewed_count": sum(item["operator_state"] == "needs_review" for item in summaries),
        "email_alert_queued_count": sum(
            item["notification_status"].get("email") == "queued_no_authenticated_transport"
            for item in summaries
        ),
        "telegram_alert_unavailable_count": sum(
            item["notification_status"].get("telegram") == "failed_or_unconfigured"
            for item in summaries
        ),
        "conversations": summaries,
        "integrity_failures": failures,
        "direct_contact_data_in_output": False,
        "pseudonymous_conversation_ids_in_output": True,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
