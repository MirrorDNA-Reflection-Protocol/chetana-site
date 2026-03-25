"""
Chetana B2B API Key Layer — Layer 46.1

Simple API key authentication + rate limiting for B2B partners.

Tiers:
  - free:    100 checks/day, 10 req/min
  - starter: 1,000 checks/day, 60 req/min  ($49/mo)
  - growth:  10,000 checks/day, 300 req/min ($199/mo)
  - enterprise: unlimited, 1000 req/min     (custom)

Keys stored in a local SQLite DB alongside usage tracking.
No external dependencies beyond stdlib + FastAPI.

Usage:
    from app.api_keys import require_api_key, create_key, key_manager

    # In FastAPI route:
    @app.post("/api/v1/scan")
    async def scan(request: Request, key_info = Depends(require_api_key)):
        ...

    # CLI management:
    python3 -m app.api_keys create --name "Acme Bank" --tier starter --email ops@acme.com
    python3 -m app.api_keys list
    python3 -m app.api_keys revoke --key ck_abc123
    python3 -m app.api_keys usage --key ck_abc123
"""

import hashlib
import json
import os
import secrets
import sqlite3
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Request, HTTPException, Depends
from fastapi.security import APIKeyHeader

# ── Config ────────────────────────────────────────────────────────────────

DB_PATH = Path.home() / ".mirrordna" / "chetana" / "api_keys.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

TIERS = {
    "free":       {"daily_limit": 100,    "rpm": 10,   "price": "$0/mo"},
    "starter":    {"daily_limit": 1_000,  "rpm": 60,   "price": "$49/mo"},
    "growth":     {"daily_limit": 10_000, "rpm": 300,  "price": "$199/mo"},
    "enterprise": {"daily_limit": 999_999, "rpm": 1000, "price": "custom"},
}

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


# ── Database ──────────────────────────────────────────────────────────────

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db():
    conn = _connect()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS api_keys (
            key_hash TEXT PRIMARY KEY,
            key_prefix TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            tier TEXT NOT NULL DEFAULT 'free',
            created_at TEXT NOT NULL,
            revoked_at TEXT,
            metadata TEXT DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_hash TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            status_code INTEGER,
            response_ms INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_usage_key_ts
            ON usage_log(key_hash, timestamp);
    """)
    conn.commit()
    conn.close()


_init_db()


# ── Key Management ────────────────────────────────────────────────────────

def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def create_key(name: str, tier: str = "free", email: str = "") -> str:
    """Create a new API key. Returns the raw key (only shown once)."""
    if tier not in TIERS:
        raise ValueError(f"Invalid tier: {tier}. Must be one of {list(TIERS.keys())}")

    raw_key = f"ck_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)

    conn = _connect()
    conn.execute(
        "INSERT INTO api_keys (key_hash, key_prefix, name, email, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (key_hash, raw_key[:10], name, email, tier, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()
    return raw_key


def revoke_key(raw_key: str) -> bool:
    """Revoke an API key."""
    key_hash = _hash_key(raw_key)
    conn = _connect()
    cur = conn.execute(
        "UPDATE api_keys SET revoked_at = ? WHERE key_hash = ? AND revoked_at IS NULL",
        (datetime.now(timezone.utc).isoformat(), key_hash),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_keys() -> list[dict]:
    """List all API keys (without hashes)."""
    conn = _connect()
    rows = conn.execute(
        "SELECT key_prefix, name, email, tier, created_at, revoked_at FROM api_keys ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_usage(raw_key: str, days: int = 30) -> dict:
    """Get usage stats for a key."""
    key_hash = _hash_key(raw_key)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    conn = _connect()

    total = conn.execute(
        "SELECT COUNT(*) as n FROM usage_log WHERE key_hash = ? AND timestamp > ?",
        (key_hash, cutoff),
    ).fetchone()["n"]

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
    today = conn.execute(
        "SELECT COUNT(*) as n FROM usage_log WHERE key_hash = ? AND timestamp > ?",
        (key_hash, today_start),
    ).fetchone()["n"]

    by_endpoint = conn.execute(
        "SELECT endpoint, COUNT(*) as n FROM usage_log WHERE key_hash = ? AND timestamp > ? GROUP BY endpoint",
        (key_hash, cutoff),
    ).fetchall()

    conn.close()
    return {
        "total_calls": total,
        "today_calls": today,
        "period_days": days,
        "by_endpoint": {r["endpoint"]: r["n"] for r in by_endpoint},
    }


# ── Rate Limiting ─────────────────────────────────────────────────────────

# In-memory rate limiting (resets on restart — acceptable for this scale)
_rate_windows: dict[str, list[float]] = {}


def _check_rate_limit(key_hash: str, rpm: int) -> bool:
    """Check if key is within RPM limit. Returns True if allowed."""
    now = time.time()
    window = _rate_windows.get(key_hash, [])
    # Clean old entries (older than 60s)
    window = [t for t in window if now - t < 60]
    if len(window) >= rpm:
        return False
    window.append(now)
    _rate_windows[key_hash] = window
    return True


def _check_daily_limit(key_hash: str, daily_limit: int) -> bool:
    """Check if key is within daily limit."""
    conn = _connect()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
    count = conn.execute(
        "SELECT COUNT(*) as n FROM usage_log WHERE key_hash = ? AND timestamp > ?",
        (key_hash, today_start),
    ).fetchone()["n"]
    conn.close()
    return count < daily_limit


def _log_usage(key_hash: str, endpoint: str, status_code: int = 200, response_ms: int = 0):
    """Log an API call."""
    conn = _connect()
    conn.execute(
        "INSERT INTO usage_log (key_hash, endpoint, timestamp, status_code, response_ms) VALUES (?, ?, ?, ?, ?)",
        (key_hash, endpoint, datetime.now(timezone.utc).isoformat(), status_code, response_ms),
    )
    conn.commit()
    conn.close()


# ── FastAPI Dependency ────────────────────────────────────────────────────

async def require_api_key(
    request: Request,
    api_key: Optional[str] = Depends(API_KEY_HEADER),
) -> dict:
    """FastAPI dependency: validates API key, checks limits, logs usage."""

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail={"error": "missing_api_key", "message": "Include your API key in the X-API-Key header. Get one at https://chetana.activemirror.ai/api"},
        )

    key_hash = _hash_key(api_key)

    # Look up key
    conn = _connect()
    row = conn.execute(
        "SELECT * FROM api_keys WHERE key_hash = ?", (key_hash,)
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=401,
            detail={"error": "invalid_api_key", "message": "This API key is not recognized."},
        )

    if row["revoked_at"]:
        raise HTTPException(
            status_code=403,
            detail={"error": "revoked_api_key", "message": "This API key has been revoked."},
        )

    tier = row["tier"]
    tier_config = TIERS.get(tier, TIERS["free"])

    # Rate limit
    if not _check_rate_limit(key_hash, tier_config["rpm"]):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": f"Rate limit: {tier_config['rpm']} requests/minute for {tier} tier.",
                "retry_after_seconds": 60,
            },
        )

    # Daily limit
    if not _check_daily_limit(key_hash, tier_config["daily_limit"]):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "daily_limit_exceeded",
                "message": f"Daily limit: {tier_config['daily_limit']} checks/day for {tier} tier. Upgrade at https://chetana.activemirror.ai/api",
            },
        )

    # Log usage
    endpoint = request.url.path
    _log_usage(key_hash, endpoint)

    return {
        "name": row["name"],
        "tier": tier,
        "daily_limit": tier_config["daily_limit"],
        "rpm": tier_config["rpm"],
    }


# ── CLI ───────────────────────────────────────────────────────────────────

def _cli():
    import argparse
    parser = argparse.ArgumentParser(description="Chetana API Key Manager")
    sub = parser.add_subparsers(dest="command")

    create_p = sub.add_parser("create", help="Create a new API key")
    create_p.add_argument("--name", required=True, help="Organization name")
    create_p.add_argument("--tier", default="free", choices=list(TIERS.keys()))
    create_p.add_argument("--email", default="", help="Contact email")

    sub.add_parser("list", help="List all API keys")

    revoke_p = sub.add_parser("revoke", help="Revoke an API key")
    revoke_p.add_argument("--key", required=True, help="Raw API key to revoke")

    usage_p = sub.add_parser("usage", help="Show usage stats")
    usage_p.add_argument("--key", required=True, help="Raw API key")
    usage_p.add_argument("--days", type=int, default=30)

    args = parser.parse_args()

    if args.command == "create":
        raw = create_key(args.name, args.tier, args.email)
        print(f"API Key created (save this — shown only once):")
        print(f"  Key:  {raw}")
        print(f"  Name: {args.name}")
        print(f"  Tier: {args.tier} ({TIERS[args.tier]['price']})")
        print(f"  Daily limit: {TIERS[args.tier]['daily_limit']}")
        print(f"  RPM: {TIERS[args.tier]['rpm']}")

    elif args.command == "list":
        keys = list_keys()
        if not keys:
            print("No API keys found.")
            return
        for k in keys:
            status = "REVOKED" if k["revoked_at"] else "ACTIVE"
            print(f"  {k['key_prefix']}... | {k['name']:20s} | {k['tier']:10s} | {status} | {k['created_at'][:10]}")

    elif args.command == "revoke":
        if revoke_key(args.key):
            print(f"Key revoked: {args.key[:10]}...")
        else:
            print("Key not found or already revoked.")

    elif args.command == "usage":
        usage = get_usage(args.key, args.days)
        print(json.dumps(usage, indent=2))

    else:
        parser.print_help()


if __name__ == "__main__":
    _cli()
