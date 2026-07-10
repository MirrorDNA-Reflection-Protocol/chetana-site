from __future__ import annotations

import ipaddress
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlparse

import httpx

RDAP_CONSENT_TOKEN = "domain-intelligence-consent"
IANA_RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
_DOMAIN_RE = re.compile(r"^(?=.{1,253}\.?$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.I)


class RdapLookupError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def normalize_domain(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise RdapLookupError("domain_missing", "Enter a domain or link to check.")
    parsed = urlparse(raw if "://" in raw else f"//{raw}")
    host = (parsed.hostname or "").strip().rstrip(".").lower()
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise RdapLookupError("domain_invalid", "That domain could not be normalized.") from exc
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise RdapLookupError("domain_ip_not_supported", "RDAP domain checks do not accept IP addresses.")
    if not _DOMAIN_RE.fullmatch(host):
        raise RdapLookupError("domain_invalid", "Enter a valid public domain or link.")
    return host


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _event_date(payload: dict[str, Any], action: str) -> datetime | None:
    for event in payload.get("events") or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("eventAction") or "").lower() == action:
            parsed = _parse_datetime(event.get("eventDate"))
            if parsed:
                return parsed
    return None


def _registrar_name(payload: dict[str, Any]) -> str | None:
    for entity in payload.get("entities") or []:
        if not isinstance(entity, dict) or "registrar" not in (entity.get("roles") or []):
            continue
        card = entity.get("vcardArray")
        properties = card[1] if isinstance(card, list) and len(card) > 1 and isinstance(card[1], list) else []
        for prop in properties:
            if isinstance(prop, list) and len(prop) >= 4 and prop[0] == "fn":
                name = str(prop[3] or "").strip()
                return name[:160] or None
    return None


class RdapClient:
    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_seconds: float = 4.0,
        bootstrap_ttl_seconds: float = 24 * 60 * 60,
    ) -> None:
        self.transport = transport
        self.timeout_seconds = timeout_seconds
        self.bootstrap_ttl_seconds = bootstrap_ttl_seconds
        self._bootstrap: dict[str, str] = {}
        self._bootstrap_loaded_at = 0.0

    async def _bootstrap_map(self, client: httpx.AsyncClient) -> dict[str, str]:
        if self._bootstrap and time.monotonic() - self._bootstrap_loaded_at < self.bootstrap_ttl_seconds:
            return self._bootstrap
        response = await client.get(IANA_RDAP_BOOTSTRAP_URL)
        response.raise_for_status()
        payload = response.json()
        services = payload.get("services") if isinstance(payload, dict) else None
        if not isinstance(services, list):
            raise ValueError("rdap_bootstrap_invalid")
        mapping: dict[str, str] = {}
        for service in services:
            if not isinstance(service, list) or len(service) != 2:
                continue
            suffixes, urls = service
            if not isinstance(suffixes, list) or not isinstance(urls, list):
                continue
            endpoint = next((str(url).rstrip("/") for url in urls if str(url).startswith("https://")), None)
            if not endpoint:
                continue
            for suffix in suffixes:
                normalized = str(suffix).strip().lower().lstrip(".")
                if normalized:
                    mapping[normalized] = endpoint
        if not mapping:
            raise ValueError("rdap_bootstrap_empty")
        self._bootstrap = mapping
        self._bootstrap_loaded_at = time.monotonic()
        return mapping

    async def lookup(self, value: str) -> dict[str, Any]:
        domain = normalize_domain(value)
        checked_at = datetime.now(timezone.utc)
        timeout = httpx.Timeout(self.timeout_seconds, connect=min(2.0, self.timeout_seconds))
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                transport=self.transport,
                follow_redirects=False,
                trust_env=False,
                headers={"Accept": "application/rdap+json, application/json"},
            ) as client:
                bootstrap = await self._bootstrap_map(client)
                endpoint = bootstrap.get(domain.rsplit(".", 1)[-1])
                if not endpoint:
                    return self._unavailable(domain, checked_at, "No IANA RDAP service was found for this suffix.")
                response = await client.get(f"{endpoint}/domain/{quote(domain, safe='')}")
                if response.status_code == 404:
                    return {
                        "domain": domain,
                        "status": "not_found",
                        "checked_at_utc": checked_at.isoformat(),
                        "registry_endpoint": endpoint,
                        "registration_created_at": None,
                        "registration_age_days": None,
                        "last_changed_at": None,
                        "registrar": None,
                        "domain_statuses": [],
                        "nameserver_count": 0,
                        "signals": ["The registry returned no RDAP record for this exact hostname."],
                        "risk_hint": "unknown",
                        "no_match_is_safe": False,
                    }
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            return self._unavailable(domain, checked_at, f"RDAP lookup unavailable ({type(exc).__name__}).")
        if not isinstance(payload, dict):
            return self._unavailable(domain, checked_at, "RDAP returned an unreadable response.")

        created = _event_date(payload, "registration")
        changed = _event_date(payload, "last changed") or _event_date(payload, "last update of rdap database")
        age_days = max(0, (checked_at - created).days) if created else None
        statuses = [str(item)[:80] for item in payload.get("status") or [] if isinstance(item, str)][:12]
        signals: list[str] = []
        risk_hint = "supporting_evidence_only"
        if age_days is not None and age_days < 30:
            signals.append(f"Domain registration is recent ({age_days} days old).")
            risk_hint = "recent_registration"
        elif age_days is not None:
            signals.append(f"Domain registration is approximately {age_days} days old.")
        hold_statuses = [status for status in statuses if "hold" in status.lower()]
        if hold_statuses:
            signals.append("The registry reports a hold status on this domain.")
            risk_hint = "registry_hold"
        if not signals:
            signals.append("RDAP returned registration metadata but no standalone risk conclusion.")

        return {
            "domain": domain,
            "status": "found",
            "checked_at_utc": checked_at.isoformat(),
            "registry_endpoint": endpoint,
            "registration_created_at": created.isoformat() if created else None,
            "registration_age_days": age_days,
            "last_changed_at": changed.isoformat() if changed else None,
            "registrar": _registrar_name(payload),
            "domain_statuses": statuses,
            "nameserver_count": len(payload.get("nameservers") or []),
            "signals": signals[:4],
            "risk_hint": risk_hint,
            "no_match_is_safe": False,
        }

    @staticmethod
    def _unavailable(domain: str, checked_at: datetime, signal: str) -> dict[str, Any]:
        return {
            "domain": domain,
            "status": "unavailable",
            "checked_at_utc": checked_at.isoformat(),
            "registry_endpoint": None,
            "registration_created_at": None,
            "registration_age_days": None,
            "last_changed_at": None,
            "registrar": None,
            "domain_statuses": [],
            "nameserver_count": 0,
            "signals": [signal],
            "risk_hint": "unknown",
            "no_match_is_safe": False,
        }


rdap_client = RdapClient()


async def lookup_domain_with_rdap(value: str) -> dict[str, Any]:
    return await rdap_client.lookup(value)
