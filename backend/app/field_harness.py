from __future__ import annotations

import html
import hashlib
from urllib.parse import quote
from typing import Any


FIELD_SOURCE_TAGS: tuple[dict[str, str], ...] = (
    {
        "source": "bank_qr",
        "label": "Bank branch QR",
        "placement": "Branch poster, ATM lobby, statement insert, fraud-awareness SMS",
        "use_case": "Customer pauses before OTP, KYC, UPI collect, APK, or fake support action.",
    },
    {
        "source": "gov_qr",
        "label": "Government awareness QR",
        "placement": "Ward office, police awareness drive, cyber cell poster, public counter",
        "use_case": "Citizen gets a first safety read before panic, payment, or complaint confusion.",
    },
    {
        "source": "csr_qr",
        "label": "CSR digital safety QR",
        "placement": "School, college, senior citizen program, NGO field session",
        "use_case": "Families and students learn one action: screenshot anything and ask Chetana.",
    },
    {
        "source": "branch_poster",
        "label": "Branch poster",
        "placement": "Teller counter, relationship manager desk, waiting area",
        "use_case": "Walk-in customers check suspicious pressure while bank staff stay out of private chats.",
    },
    {
        "source": "merchant_counter",
        "label": "Merchant counter QR",
        "placement": "Retail counter, delivery pickup desk, association WhatsApp group",
        "use_case": "Merchant pauses before accepting fake payment proof or releasing goods.",
    },
    {
        "source": "whatsapp_forward",
        "label": "WhatsApp forward",
        "placement": "Family groups, resident groups, college groups, merchant groups",
        "use_case": "A trusted person forwards a simple check link before money moves.",
    },
)

QR_VERSION = 5
QR_SIZE = 17 + (QR_VERSION * 4)
QR_DATA_CODEWORDS = 108
QR_EC_CODEWORDS = 26
QR_ALIGNMENT_CENTERS = (6, 30)
QR_EC_LEVEL_BITS = 0b01  # Level L, enough for campaign links and easiest for phone cameras.


def source_tag_map() -> dict[str, dict[str, str]]:
    return {item["source"]: item for item in FIELD_SOURCE_TAGS}


def source_label(source: str) -> str:
    return source_tag_map().get(source, {}).get("label", source.replace("_", " ").title())


def campaign_url_for_source(public_origin: str, source: str) -> str:
    if source not in source_tag_map():
        raise KeyError(source)
    return _scam_check_link(public_origin, source)


def poster_url_for_source(public_origin: str, source: str) -> str:
    if source not in source_tag_map():
        raise KeyError(source)
    return f"{public_origin.rstrip('/')}/partners/poster/{source}"


def qr_svg_url_for_source(public_origin: str, source: str) -> str:
    if source not in source_tag_map():
        raise KeyError(source)
    return f"{public_origin.rstrip('/')}/partners/qr/{source}.svg"


def _scam_check_link(public_origin: str, source: str) -> str:
    origin = public_origin.rstrip("/")
    return f"{origin}/?source={source}&action=scam_check"


def _whatsapp_text(public_origin: str) -> str:
    return (
        "Fake hai kya? Screenshot bhejo. Chetana bata degi.\n\n"
        "Use this before paying, sharing OTP, installing an app, approving UPI, "
        f"or trusting a payment screenshot:\n{_scam_check_link(public_origin, 'whatsapp_forward')}"
    )


def _whatsapp_link(public_origin: str) -> str:
    return f"https://wa.me/?text={quote(_whatsapp_text(public_origin))}"


def build_field_harness(public_origin: str) -> dict[str, Any]:
    campaign_links = [
        {
            "source": item["source"],
            "label": item["label"],
            "placement": item["placement"],
            "use_case": item["use_case"],
            "url": _scam_check_link(public_origin, item["source"]),
            "qr_payload": _scam_check_link(public_origin, item["source"]),
            "qr_svg_url": qr_svg_url_for_source(public_origin, item["source"]),
            "poster_url": poster_url_for_source(public_origin, item["source"]),
            "tracked_params": {
                "source": item["source"],
                "action": "scam_check",
            },
        }
        for item in FIELD_SOURCE_TAGS
    ]
    return {
        "schema_version": "chetana.field_harness.v0.1",
        "sponsor_safe": True,
        "title": "Chetana 30-Day Field Harness",
        "public_origin": public_origin.rstrip("/"),
        "core_loop": [
            "User sees a QR, poster, WhatsApp forward, branch prompt, or merchant counter link.",
            "User screenshots, pastes, speaks, or taps the suspicious context.",
            "Chetana returns verdict, safest next action, compact proof, and official rails.",
            "User can share, copy a case packet, tap official rails, or submit bucketed feedback.",
            "Sponsor receives aggregate PilotTrace proof only.",
        ],
        "campaign_links": campaign_links,
        "whatsapp": {
            "text": _whatsapp_text(public_origin),
            "url": _whatsapp_link(public_origin),
        },
        "feedback_buckets": [
            {
                "id": "missed_scam",
                "label": "This was a scam but Chetana was too safe",
                "purpose": "False-safe complaint for review.",
                "free_text": False,
            },
            {
                "id": "too_cautious",
                "label": "Chetana warned too strongly",
                "purpose": "False-alarm report for calibration.",
                "free_text": False,
            },
            {
                "id": "scammed_after_scan",
                "label": "I was still scammed after checking",
                "purpose": "Follow-through failure signal.",
                "free_text": False,
            },
            {
                "id": "helped_me_pause",
                "label": "Chetana helped me stop",
                "purpose": "Positive pause signal.",
                "free_text": False,
            },
        ],
        "event_contract": [
            "app_open with source_param and action_param",
            "scan_started",
            "scan_completed with verdict, scam_type, input_type, language_hint, and device_class",
            "report_tapped with official_rail_id and recovery_step",
            "evidence_saved with recovery_step",
            "share_completed with share_channel",
            "feedback_submitted with feedback_type only",
            "local_scan_memory_cleared",
        ],
        "pilottrace_metrics": [
            "scans_completed",
            "high_risk_pauses",
            "follow_through_actions",
            "follow_through_sessions",
            "false_safe_complaints",
            "false_alarm_reports",
            "feedback_submissions",
            "official_rail_taps",
            "case_packets_copied",
            "share_completes",
            "privacy_controls_used",
            "source_params",
            "action_params",
        ],
        "privacy_boundary": [
            "No raw scan text is included in sponsor reporting.",
            "No screenshots, media, UPI IDs, phone numbers, URLs, emails, or message bodies are included.",
            "No user accounts, user profiles, or sponsor-visible identity graph are created.",
            "Partner reporting uses aggregate counters, source tags, and bucketed feedback.",
            "Raw examples require explicit user consent and separate research handling.",
        ],
        "consent_rule": "Aggregate by default; raw examples only with explicit opt-in.",
        "pilot_day_plan": [
            {"day": "0-2", "step": "Choose one audience and freeze source tags."},
            {"day": "3-7", "step": "Publish QR/WhatsApp links and validate event attribution."},
            {"day": "8-21", "step": "Review PilotTrace aggregates and tune copy, not user privacy boundaries."},
            {"day": "22-30", "step": "Deliver sponsor-safe proof and decide sponsorship, CSR, or integration path."},
        ],
    }


def build_field_launch_receipt(public_origin: str) -> dict[str, Any]:
    harness = build_field_harness(public_origin)
    assets = []
    for item in harness["campaign_links"]:
        source = item["source"]
        qr_svg = render_qr_svg(item["qr_payload"], title=f"Chetana {item['label']} campaign code")
        poster_html = render_campaign_poster_html(public_origin, source)
        assets.append({
            "source": source,
            "label": item["label"],
            "campaign_url": item["url"],
            "qr_payload": item["qr_payload"],
            "qr_svg_url": item["qr_svg_url"],
            "poster_url": item["poster_url"],
            "tracked_params": item["tracked_params"],
            "qr_payload_sha256": hashlib.sha256(item["qr_payload"].encode("utf-8")).hexdigest(),
            "qr_svg_sha256": hashlib.sha256(qr_svg.encode("utf-8")).hexdigest(),
            "poster_html_sha256": hashlib.sha256(poster_html.encode("utf-8")).hexdigest(),
            "checks": {
                "campaign_url_has_source": f"source={source}" in item["url"],
                "campaign_url_has_action": "action=scam_check" in item["url"],
                "qr_svg_embeds_payload": html.escape(item["qr_payload"]) in qr_svg,
                "poster_embeds_payload": html.escape(item["qr_payload"]) in poster_html,
                "qr_and_poster_routes_present": bool(item["qr_svg_url"] and item["poster_url"]),
            },
        })
    all_ready = all(all(asset["checks"].values()) for asset in assets)
    return {
        "schema_version": "chetana.field_launch_receipt.v0.1",
        "status": "ready_for_distribution" if all_ready else "needs_review",
        "sponsor_safe": True,
        "public_origin": public_origin.rstrip("/"),
        "asset_count": len(assets),
        "campaign_assets": assets,
        "privacy_boundary": harness["privacy_boundary"],
        "event_contract": harness["event_contract"],
        "pilottrace_metrics": harness["pilottrace_metrics"],
        "proof_limits": [
            "This receipt verifies generated campaign URLs, QR SVG payloads, and printable poster payloads.",
            "This receipt does not prove a physical phone camera scanned the QR.",
            "This receipt does not prove campaign distribution or user traffic.",
            "PilotTrace must be used after launch to verify real scans, pauses, and follow-through.",
        ],
        "phone_camera_scan_proof": {
            "status": "unchecked",
            "reason": "Requires a reachable physical phone or external camera scan receipt.",
        },
    }


def _count_list(items: list[str]) -> str:
    return "\n".join(f"<li>{html.escape(item)}</li>" for item in items)


def _gf_tables() -> tuple[list[int], list[int]]:
    exp = [0] * 512
    log = [0] * 256
    value = 1
    for i in range(255):
        exp[i] = value
        log[value] = i
        value <<= 1
        if value & 0x100:
            value ^= 0x11D
    for i in range(255, 512):
        exp[i] = exp[i - 255]
    return exp, log


_GF_EXP, _GF_LOG = _gf_tables()


def _gf_mul(left: int, right: int) -> int:
    if left == 0 or right == 0:
        return 0
    return _GF_EXP[_GF_LOG[left] + _GF_LOG[right]]


def _rs_generator(degree: int) -> list[int]:
    poly = [1]
    for i in range(degree):
        factor = [1, _GF_EXP[i]]
        next_poly = [0] * (len(poly) + 1)
        for j, coeff in enumerate(poly):
            next_poly[j] ^= coeff
            next_poly[j + 1] ^= _gf_mul(coeff, factor[1])
        poly = next_poly
    return poly


def _rs_remainder(data: list[int], ec_count: int) -> list[int]:
    generator = _rs_generator(ec_count)
    result = [0] * ec_count
    for codeword in data:
        factor = codeword ^ result[0]
        result = result[1:] + [0]
        for i in range(ec_count):
            result[i] ^= _gf_mul(generator[i + 1], factor)
    return result


def _byte_bits(payload: str) -> list[int]:
    data = payload.encode("utf-8")
    if len(data) > QR_DATA_CODEWORDS - 3:
        raise ValueError("payload_too_long_for_campaign_qr")
    bits: list[int] = []

    def append(value: int, width: int) -> None:
        for bit in range(width - 1, -1, -1):
            bits.append((value >> bit) & 1)

    append(0b0100, 4)
    append(len(data), 8)
    for byte in data:
        append(byte, 8)
    for _ in range(min(4, (QR_DATA_CODEWORDS * 8) - len(bits))):
        bits.append(0)
    while len(bits) % 8:
        bits.append(0)
    codewords = [int("".join(str(bit) for bit in bits[i:i + 8]), 2) for i in range(0, len(bits), 8)]
    pads = (0xEC, 0x11)
    index = 0
    while len(codewords) < QR_DATA_CODEWORDS:
        codewords.append(pads[index % 2])
        index += 1
    return [
        (codeword >> bit) & 1
        for codeword in codewords + _rs_remainder(codewords, QR_EC_CODEWORDS)
        for bit in range(7, -1, -1)
    ]


def _blank_matrix() -> tuple[list[list[bool]], list[list[bool]]]:
    return (
        [[False for _ in range(QR_SIZE)] for _ in range(QR_SIZE)],
        [[False for _ in range(QR_SIZE)] for _ in range(QR_SIZE)],
    )


def _set_function(modules: list[list[bool]], reserved: list[list[bool]], row: int, col: int, dark: bool) -> None:
    if 0 <= row < QR_SIZE and 0 <= col < QR_SIZE:
        modules[row][col] = dark
        reserved[row][col] = True


def _draw_finder(modules: list[list[bool]], reserved: list[list[bool]], row: int, col: int) -> None:
    for dy in range(-1, 8):
        for dx in range(-1, 8):
            rr = row + dy
            cc = col + dx
            if not (0 <= rr < QR_SIZE and 0 <= cc < QR_SIZE):
                continue
            dark = (
                0 <= dy <= 6
                and 0 <= dx <= 6
                and (dy in {0, 6} or dx in {0, 6} or (2 <= dy <= 4 and 2 <= dx <= 4))
            )
            _set_function(modules, reserved, rr, cc, dark)


def _draw_alignment(modules: list[list[bool]], reserved: list[list[bool]], center_row: int, center_col: int) -> None:
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            rr = center_row + dy
            cc = center_col + dx
            dark = max(abs(dy), abs(dx)) != 1
            _set_function(modules, reserved, rr, cc, dark)


def _reserve_format(modules: list[list[bool]], reserved: list[list[bool]]) -> None:
    for i in range(9):
        if i != 6:
            _set_function(modules, reserved, 8, i, False)
            _set_function(modules, reserved, i, 8, False)
    for i in range(8):
        _set_function(modules, reserved, QR_SIZE - 1 - i, 8, False)
        _set_function(modules, reserved, 8, QR_SIZE - 1 - i, False)


def _draw_function_patterns(modules: list[list[bool]], reserved: list[list[bool]]) -> None:
    _draw_finder(modules, reserved, 0, 0)
    _draw_finder(modules, reserved, 0, QR_SIZE - 7)
    _draw_finder(modules, reserved, QR_SIZE - 7, 0)
    for i in range(8, QR_SIZE - 8):
        dark = i % 2 == 0
        _set_function(modules, reserved, 6, i, dark)
        _set_function(modules, reserved, i, 6, dark)
    for row in QR_ALIGNMENT_CENTERS:
        for col in QR_ALIGNMENT_CENTERS:
            if (row <= 8 and col <= 8) or (row <= 8 and col >= QR_SIZE - 9) or (row >= QR_SIZE - 9 and col <= 8):
                continue
            _draw_alignment(modules, reserved, row, col)
    _set_function(modules, reserved, QR_SIZE - 8, 8, True)
    _reserve_format(modules, reserved)


def _mask_bit(mask: int, row: int, col: int) -> bool:
    if mask == 0:
        return (row + col) % 2 == 0
    if mask == 1:
        return row % 2 == 0
    if mask == 2:
        return col % 3 == 0
    if mask == 3:
        return (row + col) % 3 == 0
    if mask == 4:
        return ((row // 2) + (col // 3)) % 2 == 0
    if mask == 5:
        return ((row * col) % 2 + (row * col) % 3) == 0
    if mask == 6:
        return (((row * col) % 2 + (row * col) % 3) % 2) == 0
    return (((row + col) % 2 + (row * col) % 3) % 2) == 0


def _place_data(payload: str, mask: int) -> tuple[list[list[bool]], list[list[bool]]]:
    modules, reserved = _blank_matrix()
    _draw_function_patterns(modules, reserved)
    bits = _byte_bits(payload)
    bit_index = 0
    upward = True
    col = QR_SIZE - 1
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(QR_SIZE - 1, -1, -1) if upward else range(QR_SIZE)
        for row in rows:
            for cc in (col, col - 1):
                if reserved[row][cc]:
                    continue
                dark = bits[bit_index] == 1 if bit_index < len(bits) else False
                if _mask_bit(mask, row, cc):
                    dark = not dark
                modules[row][cc] = dark
                bit_index += 1
        upward = not upward
        col -= 2
    _draw_format_bits(modules, reserved, mask)
    return modules, reserved


def _format_bits(mask: int) -> int:
    data = (QR_EC_LEVEL_BITS << 3) | mask
    bits = data << 10
    generator = 0x537
    for i in range(14, 9, -1):
        if (bits >> i) & 1:
            bits ^= generator << (i - 10)
    return ((data << 10) | bits) ^ 0x5412


def _draw_format_bits(modules: list[list[bool]], reserved: list[list[bool]], mask: int) -> None:
    bits = _format_bits(mask)
    for i in range(6):
        _set_function(modules, reserved, 8, i, ((bits >> i) & 1) == 1)
    _set_function(modules, reserved, 8, 7, ((bits >> 6) & 1) == 1)
    _set_function(modules, reserved, 8, 8, ((bits >> 7) & 1) == 1)
    _set_function(modules, reserved, 7, 8, ((bits >> 8) & 1) == 1)
    for i in range(9, 15):
        _set_function(modules, reserved, 14 - i, 8, ((bits >> i) & 1) == 1)
    for i in range(8):
        _set_function(modules, reserved, QR_SIZE - 1 - i, 8, ((bits >> i) & 1) == 1)
    for i in range(8, 15):
        _set_function(modules, reserved, 8, QR_SIZE - 15 + i, ((bits >> i) & 1) == 1)
    _set_function(modules, reserved, QR_SIZE - 8, 8, True)


def _penalty(modules: list[list[bool]]) -> int:
    penalty = 0
    for row in range(QR_SIZE):
        run_color = modules[row][0]
        run_length = 1
        for col in range(1, QR_SIZE):
            if modules[row][col] == run_color:
                run_length += 1
            else:
                if run_length >= 5:
                    penalty += 3 + (run_length - 5)
                run_color = modules[row][col]
                run_length = 1
        if run_length >= 5:
            penalty += 3 + (run_length - 5)
    for col in range(QR_SIZE):
        run_color = modules[0][col]
        run_length = 1
        for row in range(1, QR_SIZE):
            if modules[row][col] == run_color:
                run_length += 1
            else:
                if run_length >= 5:
                    penalty += 3 + (run_length - 5)
                run_color = modules[row][col]
                run_length = 1
        if run_length >= 5:
            penalty += 3 + (run_length - 5)
    for row in range(QR_SIZE - 1):
        for col in range(QR_SIZE - 1):
            color = modules[row][col]
            if modules[row][col + 1] == color and modules[row + 1][col] == color and modules[row + 1][col + 1] == color:
                penalty += 3
    pattern = [True, False, True, True, True, False, True, False, False, False, False]
    reverse = list(reversed(pattern))
    for row in range(QR_SIZE):
        line = modules[row]
        for col in range(QR_SIZE - 10):
            if line[col:col + 11] == pattern or line[col:col + 11] == reverse:
                penalty += 40
    for col in range(QR_SIZE):
        line = [modules[row][col] for row in range(QR_SIZE)]
        for row in range(QR_SIZE - 10):
            if line[row:row + 11] == pattern or line[row:row + 11] == reverse:
                penalty += 40
    dark = sum(1 for row in modules for item in row if item)
    percent = (dark * 100) // (QR_SIZE * QR_SIZE)
    penalty += (abs(percent - 50) // 5) * 10
    return penalty


def _qr_matrix(payload: str) -> list[list[bool]]:
    candidates = [(_penalty(_place_data(payload, mask)[0]), mask) for mask in range(8)]
    _, best_mask = min(candidates)
    return _place_data(payload, best_mask)[0]


def render_qr_svg(payload: str, *, title: str, border: int = 4, scale: int = 8) -> str:
    modules = _qr_matrix(payload)
    view_size = QR_SIZE + (border * 2)
    rects = []
    for row, values in enumerate(modules):
        for col, dark in enumerate(values):
            if dark:
                rects.append(f'<rect x="{col + border}" y="{row + border}" width="1" height="1"/>')
    escaped_title = html.escape(title)
    escaped_payload = html.escape(payload)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_size} {view_size}" width="{view_size * scale}" height="{view_size * scale}" role="img" aria-label="{escaped_title}" shape-rendering="crispEdges">
  <title>{escaped_title}</title>
  <desc>{escaped_payload}</desc>
  <rect width="{view_size}" height="{view_size}" fill="#ffffff"/>
  <g fill="#111827">
    {''.join(rects)}
  </g>
</svg>"""


def render_campaign_poster_html(public_origin: str, source: str) -> str:
    source_info = source_tag_map()[source]
    campaign_url = campaign_url_for_source(public_origin, source)
    qr_svg = render_qr_svg(campaign_url, title=f"Chetana {source_info['label']} QR")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chetana Printable Poster - {html.escape(source_info["label"])}</title>
  <meta name="description" content="Printable Chetana QR poster for {html.escape(source_info["label"])} campaigns.">
  <style>
    :root {{ color-scheme: light; --ink:#111827; --muted:#4b5563; --line:#d1d5db; --accent:#047857; --gold:#a16207; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:#f3f4f6; color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ width:min(100%, 840px); min-height:100vh; margin:0 auto; padding:28px; background:#fff; display:grid; align-content:center; gap:20px; }}
    .top {{ display:flex; justify-content:space-between; gap:16px; padding-bottom:16px; border-bottom:2px solid var(--ink); }}
    .label {{ color:var(--gold); font-size:.78rem; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }}
    h1 {{ margin:0; font-size:clamp(4rem, 14vw, 8.5rem); line-height:.86; letter-spacing:0; }}
    .sub {{ margin:0; color:var(--muted); font-size:clamp(1.4rem, 4vw, 2.4rem); font-weight:800; }}
    .grid {{ display:grid; grid-template-columns:minmax(260px, 380px) minmax(0,1fr); gap:24px; align-items:center; }}
    .qr {{ display:grid; place-items:center; padding:16px; border:2px solid var(--ink); border-radius:8px; }}
    .qr svg {{ width:100%; height:auto; max-width:360px; }}
    .copy {{ display:grid; gap:14px; }}
    .promise {{ border:1px solid var(--line); border-radius:8px; padding:16px; }}
    .promise strong {{ display:block; margin-bottom:6px; font-size:1.1rem; }}
    p {{ margin:0; color:var(--muted); line-height:1.5; }}
    a {{ color:var(--accent); font-weight:900; overflow-wrap:anywhere; }}
    .url {{ padding:12px; border-radius:8px; background:#ecfdf5; color:#065f46; font-weight:900; text-align:center; overflow-wrap:anywhere; }}
    .foot {{ padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:.86rem; line-height:1.45; }}
    @media (max-width:720px) {{ main {{ padding:18px; }} .top, .grid {{ display:grid; grid-template-columns:1fr; }} }}
    @media print {{ body {{ background:#fff; }} main {{ width:100%; min-height:auto; padding:18mm; }} a {{ color:var(--ink); }} .no-print {{ display:none; }} }}
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <div class="label">Chetana by Active Mirror</div>
        <strong>{html.escape(source_info["label"])}</strong>
      </div>
      <p class="no-print"><a href="{html.escape(qr_svg_url_for_source(public_origin, source), quote=True)}">Open QR SVG</a></p>
    </div>
    <section class="grid">
      <div class="qr">{qr_svg}</div>
      <div class="copy">
        <h1>Fake hai kya?</h1>
        <p class="sub">Screenshot bhejo. Chetana bata degi.</p>
        <div class="promise"><strong>Before you pay, approve UPI, share OTP, install an app, or trust a payment screenshot.</strong><p>Scan this QR and ask Chetana. No login. No complaint filed automatically. Official next steps only.</p></div>
        <div class="url">{html.escape(campaign_url)}</div>
      </div>
    </section>
    <div class="foot">Chetana is independent and is not a government, RBI, NPCI, I4C, CERT-In, police, or bank service. If money already moved, call 1930 and contact your bank immediately.</div>
  </main>
</body>
</html>"""


def render_field_harness_html(harness: dict[str, Any]) -> str:
    campaign_rows = "\n".join(
        f"""<div class="row">
          <span>{html.escape(item["label"])}</span>
          <p>{html.escape(item["placement"])}<br><a href="{html.escape(item["url"], quote=True)}">{html.escape(item["url"])}</a><br><a href="{html.escape(item["qr_svg_url"], quote=True)}">Open QR SVG</a> | <a href="{html.escape(item["poster_url"], quote=True)}">Open printable poster</a></p>
        </div>"""
        for item in harness["campaign_links"]
    )
    feedback_rows = "\n".join(
        f"""<div class="row">
          <span>{html.escape(item["id"])}</span>
          <p>{html.escape(item["label"])}<br>{html.escape(item["purpose"])} Free text: {str(item["free_text"]).lower()}.</p>
        </div>"""
        for item in harness["feedback_buckets"]
    )
    plan_steps = "\n".join(
        f"""<div class="step"><span>Day {html.escape(item["day"])}</span><strong>{html.escape(item["step"])}</strong></div>"""
        for item in harness["pilot_day_plan"]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chetana 30-Day Field Harness</title>
  <meta name="description" content="Chetana field harness for source-tagged QR and WhatsApp pilots with sponsor-safe aggregate reporting.">
  <style>
    :root {{ color-scheme: light; --ink:#111827; --muted:#4b5563; --line:#d1d5db; --soft:#f8fafc; --accent:#047857; --gold:#a16207; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:#fff; color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }}
    main {{ width:100%; max-width:1040px; margin:0 auto; padding:34px 22px 44px; }}
    a {{ color:var(--accent); font-weight:800; overflow-wrap:anywhere; }}
    h1 {{ max-width:860px; margin:10px 0 12px; font-size:clamp(2.2rem, 6vw, 4.8rem); line-height:.96; letter-spacing:0; }}
    h2 {{ margin:0 0 10px; font-size:1.18rem; }}
    p {{ margin:0; color:var(--muted); }}
    .top {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding-bottom:18px; border-bottom:2px solid var(--ink); }}
    .label {{ color:var(--gold); font-size:.74rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }}
    .lead {{ max-width:760px; font-size:1.1rem; }}
    .cta {{ display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 24px; }}
    .cta a {{ display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 14px; border-radius:8px; text-decoration:none; }}
    .primary {{ background:var(--accent); color:#fff; }}
    .secondary {{ border:1px solid var(--line); color:var(--ink); }}
    .grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:20px 0; }}
    .card, .box, .step {{ border:1px solid var(--line); border-radius:8px; background:#fff; padding:16px; }}
    .card {{ min-height:150px; background:var(--soft); }}
    .card strong, .step strong {{ display:block; margin-bottom:8px; color:var(--ink); }}
    .split {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:16px; }}
    .rows {{ display:grid; overflow:hidden; border:1px solid var(--line); border-radius:8px; }}
    .row {{ display:grid; grid-template-columns:180px minmax(0,1fr); gap:12px; padding:11px 12px; border-bottom:1px solid var(--line); }}
    .row:last-child {{ border-bottom:0; }}
    .row span, .step span {{ color:var(--gold); font-size:.72rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
    .steps {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:12px; }}
    ul {{ margin:.25rem 0 0; padding-left:1.1rem; color:var(--muted); }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; margin:10px 0 0; padding:14px; border-radius:8px; background:#0f172a; color:#e5e7eb; font-size:.94rem; line-height:1.55; }}
    .foot {{ margin-top:22px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:.86rem; }}
    @media (max-width:820px) {{ .top, .split {{ display:grid; grid-template-columns:1fr; }} .grid, .steps {{ grid-template-columns:1fr; }} .row {{ grid-template-columns:1fr; }} }}
    @media print {{ .cta {{ display:none; }} main {{ padding:18px; }} a {{ color:var(--ink); }} }}
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <div class="label">Chetana by Active Mirror</div>
        <strong>Field harness</strong>
      </div>
      <p>Schema: <strong>{html.escape(harness["schema_version"])}</strong> | Sponsor-safe: <strong>{str(harness["sponsor_safe"]).lower()}</strong></p>
    </div>

    <h1>Chetana 30-Day Field Harness</h1>
    <p class="lead">Run source-tagged QR and WhatsApp campaigns that create real users, aggregate learning, and sponsor-safe proof without giving partners raw scam content.</p>
    <div class="cta">
      <a class="primary" href="{html.escape(harness["campaign_links"][0]["url"], quote=True)}">Open bank QR link</a>
      <a class="primary" href="{html.escape(harness["whatsapp"]["url"], quote=True)}">Forward WhatsApp copy</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/api/v1/partners/field-harness">Open JSON contract</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/api/v1/partners/field-harness/launch-receipt">Open launch receipt</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/partners/pilottrace">View PilotTrace</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/partners/30-day-pilot">Open 30-day pilot</a>
    </div>

    <section class="grid">
      <div class="card"><strong>One user action</strong><p>Screenshot anything suspicious and ask Chetana before paying, approving, sharing OTP, installing APK, or trusting payment proof.</p></div>
      <div class="card"><strong>One sponsor proof</strong><p>PilotTrace reports aggregate scans, high-risk pauses, official rail taps, case packet copies, shares, feedback, and privacy controls.</p></div>
      <div class="card"><strong>One research boundary</strong><p>Aggregate by default. Raw examples require explicit user opt-in and separate handling.</p></div>
    </section>

    <section class="split">
      <div class="box">
        <div class="label">Core loop</div>
        <h2>What happens in the field</h2>
        <ul>{_count_list(harness["core_loop"])}</ul>
      </div>
      <div class="box">
        <div class="label">WhatsApp copy</div>
        <h2>Forwardable message</h2>
        <pre>{html.escape(harness["whatsapp"]["text"])}</pre>
      </div>
    </section>

    <section class="box">
      <div class="label">Campaign links</div>
      <h2>Use one source tag per audience</h2>
      <p>Turn each URL into a QR code. Chetana counts the campaign label and action, not private scam text.</p>
      <div class="rows">{campaign_rows}</div>
    </section>

    <section class="split">
      <div class="box">
        <div class="label">Feedback buckets</div>
        <h2>Learn without open text collection</h2>
        <div class="rows">{feedback_rows}</div>
      </div>
      <div class="box">
        <div class="label">Privacy boundary</div>
        <h2>What sponsors do not get</h2>
        <ul>{_count_list(harness["privacy_boundary"])}</ul>
      </div>
    </section>

    <section>
      <div class="label">Pilot rhythm</div>
      <div class="steps">{plan_steps}</div>
    </section>

    <div class="foot">
      Chetana is independent and is not a government, RBI, NPCI, I4C, CERT-In, police, or bank service. The harness is a deployment contract for sponsor-safe pilots, not a fraud database.
    </div>
  </main>
</body>
</html>"""
