from __future__ import annotations

import html
from typing import Any
from urllib.parse import quote


OPERATOR_EMAIL = "paul@activemirror.ai"


def _escape(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _message_block(title: str, messages: list[str]) -> str:
    if not messages:
        return f"<section><h3>{_escape(title)}</h3><p class='muted'>No retained text in this section.</p></section>"
    rows = "".join(f"<li>{_escape(message)}</li>" for message in messages)
    return f"<section><h3>{_escape(title)}</h3><ol>{rows}</ol></section>"


def render_partner_decision_inbox(
    packets: list[dict[str, Any]],
    *,
    email_transport: str,
) -> str:
    needs_review = sum(packet["operator_state"] == "needs_review" for packet in packets)
    sections: list[str] = []
    for packet in packets:
        contact = packet["contact"]
        notifications = packet.get("notifications", [])
        notification_rows = "".join(
            "<li><strong>{}</strong>: {} <span class='muted'>{}</span></li>".format(
                _escape(item.get("channel")),
                _escape(item.get("status")),
                _escape(item.get("recorded_at_utc")),
            )
            for item in notifications
        ) or "<li class='muted'>No alert receipt recorded.</li>"
        conversation_id = packet["conversation_id"]
        packet_link = f"/operator/partner-desk/{quote(conversation_id, safe='')}.json"
        sections.append(
            f"""
            <article class="decision">
              <header>
                <div>
                  <p class="eyebrow">{_escape(packet['pilot_type'])}</p>
                  <h2>{_escape(contact['organization'])}</h2>
                  <p>{_escape(contact['name'])} · {_escape(contact.get('role'))} · <a href="mailto:{_escape(contact['email'])}">{_escape(contact['email'])}</a></p>
                </div>
                <span class="state {_escape(packet['operator_state'])}">{_escape(packet['operator_state']).replace('_', ' ')}</span>
              </header>
              <div class="meta">
                <span>{_escape(conversation_id)}</span>
                <span>Created {_escape(packet['created_at_utc'])}</span>
                <span>Expires {_escape(packet['expires_at_utc'])}</span>
              </div>
              {_message_block('Decision requested', packet['decision_requests'])}
              {_message_block('Qualified scope', packet['scope_messages'])}
              <section>
                <h3>Alert receipts</h3>
                <ul>{notification_rows}</ul>
              </section>
              <p class="boundary">{_escape(packet['authority_boundary'])}</p>
              <footer>
                <a class="button" href="{packet_link}">Open hashed JSON packet</a>
                <form method="post" action="/operator/partner-desk/{_escape(conversation_id)}/review">
                  <input type="hidden" name="state" value="reviewed_no_commitment">
                  <button type="submit">Mark reviewed</button>
                </form>
                <form method="post" action="/operator/partner-desk/{_escape(conversation_id)}/review">
                  <input type="hidden" name="state" value="closed_no_commitment">
                  <button class="quiet" type="submit">Close without commitment</button>
                </form>
              </footer>
            </article>
            """
        )
    content = "".join(sections) or "<p class='empty'>No retained partner conversations.</p>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Chetana Partner Decision Inbox</title>
  <style>
    :root {{ color-scheme: dark; --bg:#090b0e; --panel:#10151a; --line:#2a343d; --text:#f2f5f7; --muted:#9ca8b3; --accent:#45d6bd; --hold:#f3c969; }}
    * {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); font:15px/1.55 system-ui,sans-serif; }}
    main {{ width:min(1040px,calc(100% - 32px)); margin:32px auto 72px; }}
    .top {{ display:flex; justify-content:space-between; align-items:end; gap:20px; border-bottom:1px solid var(--line); padding-bottom:20px; }}
    h1 {{ font-size:clamp(25px,4vw,40px); margin:0; }} h2 {{ margin:2px 0; font-size:22px; }} h3 {{ font-size:13px; text-transform:uppercase; color:var(--muted); }}
    .summary {{ display:flex; gap:18px; flex-wrap:wrap; color:var(--muted); }} .summary strong {{ color:var(--text); }}
    .notice {{ margin:20px 0; border-left:3px solid var(--hold); padding:12px 16px; background:#15130d; }}
    .decision {{ border-bottom:1px solid var(--line); padding:28px 0; }} .decision header {{ display:flex; justify-content:space-between; gap:20px; }}
    .eyebrow {{ color:var(--accent); text-transform:uppercase; font-size:12px; font-weight:700; margin:0; }}
    .state {{ border:1px solid var(--line); padding:5px 9px; height:max-content; text-transform:uppercase; font-size:11px; font-weight:700; }}
    .state.needs_review {{ color:var(--hold); border-color:#715f28; }} .meta {{ display:flex; gap:12px 20px; flex-wrap:wrap; color:var(--muted); font:12px ui-monospace,monospace; margin:14px 0; }}
    section {{ margin:18px 0; }} ol,ul {{ padding-left:20px; }} li {{ margin:7px 0; overflow-wrap:anywhere; }}
    .boundary {{ border-left:3px solid var(--accent); padding:10px 14px; color:var(--muted); background:#0c1718; }}
    footer {{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }} form {{ margin:0; }} button,.button {{ border:1px solid var(--accent); background:var(--accent); color:#06110f; padding:9px 12px; font-weight:700; text-decoration:none; cursor:pointer; }}
    button.quiet {{ background:transparent; color:var(--text); border-color:var(--line); }} a {{ color:var(--accent); }} .muted,.empty {{ color:var(--muted); }}
    @media(max-width:650px) {{ .top,.decision header {{ align-items:start; flex-direction:column; }} .state {{ align-self:start; }} }}
    @media print {{ form,.button {{ display:none; }} body {{ background:white; color:black; }} .decision {{ break-inside:avoid; }} }}
  </style>
</head>
<body><main>
  <header class="top">
    <div><p class="eyebrow">Loopback-only operator surface</p><h1>Chetana Partner Decision Inbox</h1></div>
    <div class="summary"><span><strong>{len(packets)}</strong> conversations</span><span><strong>{needs_review}</strong> decisions</span></div>
  </header>
  <div class="notice"><strong>Operator email:</strong> {_escape(OPERATOR_EMAIL)} · {_escape(email_transport)}. Alerts contain a pseudonymous conversation ID but no name, email, organisation, or message text. Inbox actions only change internal workflow state; they never reply to a prospect or approve terms.</div>
  {content}
</main></body></html>"""
