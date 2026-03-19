from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_EXCLUDE_NAMES = {
    ".git",
    ".venv",
    "__pycache__",
    "dist",
    "node_modules",
    "venv",
}


def atomic_write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_path(raw: str, root: Path) -> Path:
    text = os.path.expandvars(raw)
    if text == "~":
        return Path.home().resolve()
    if text.startswith("~/"):
        return (Path.home() / text[2:]).resolve()
    path = Path(text)
    return path.resolve() if path.is_absolute() else (root / path).resolve()


def relative_to(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except Exception:
        return str(path)


def run_git(repo_root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.stdout.strip() if proc.returncode == 0 else ""


def git_status(repo_root: Path, exclude_names: set[str]) -> tuple[bool, list[str]]:
    proc = subprocess.run(
        ["git", "-C", str(repo_root), "status", "--short"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return False, []
    items: list[str] = []
    for line in proc.stdout.splitlines():
        text = line[3:].strip() if len(line) > 3 else line.strip()
        if "->" in text:
            text = text.split("->", 1)[1].strip()
        if text and Path(text).name not in exclude_names:
            items.append(text)
    return bool(items), items


def iter_files(path: Path, exclude_names: set[str]) -> list[Path]:
    if not path.exists():
        return []
    if path.is_file():
        return [path]
    files: list[Path] = []
    for root, dirs, names in os.walk(path):
        dirs[:] = [name for name in dirs if name not in exclude_names]
        current_root = Path(root)
        for name in names:
            if name not in exclude_names:
                files.append(current_root / name)
    return sorted(files)


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_watch_state(repo_root: Path, watch_paths: list[str], exclude_names: set[str]) -> dict:
    missing: list[str] = []
    files: list[Path] = []
    for raw in watch_paths:
        path = resolve_path(raw, repo_root)
        if not path.exists():
            missing.append(raw)
            continue
        files.extend(iter_files(path, exclude_names))

    digest = hashlib.sha256()
    newest_path = ""
    newest_mtime = 0.0
    for path in sorted(files):
        rel = relative_to(path, repo_root)
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256_path(path).encode("utf-8"))
        digest.update(b"\0")
        mtime = path.stat().st_mtime
        if mtime >= newest_mtime:
            newest_mtime = mtime
            newest_path = rel

    return {
        "watch_roots": watch_paths,
        "watch_file_count": len(files),
        "missing_paths": missing,
        "watch_fingerprint": digest.hexdigest(),
        "newest_path": newest_path,
        "newest_mtime": (
            datetime.fromtimestamp(newest_mtime, tz=timezone.utc).isoformat()
            if newest_mtime > 0
            else ""
        ),
    }


def build_receipt(args: argparse.Namespace) -> dict:
    repo_root = Path(args.repo_root).resolve()
    exclude_set = set(DEFAULT_EXCLUDE_NAMES)
    exclude_set.update(name for name in args.exclude_name if name)
    dirty, dirty_files = git_status(repo_root, exclude_set)
    return {
        "schema_version": "edge-truth.v1",
        "generated_at": utc_now_iso(),
        "surface": {
            "id": args.surface_id,
            "product": args.product,
            "domain": args.domain,
            "origin": args.origin,
            "kind": args.kind,
            "builder": args.builder,
            "served_paths": [str(item) for item in args.served_path if str(item).strip()],
        },
        "source": {
            "repo": repo_root.name,
            "branch": run_git(repo_root, "rev-parse", "--abbrev-ref", "HEAD"),
            "commit": run_git(repo_root, "rev-parse", "HEAD"),
            "committed_at": run_git(repo_root, "log", "-1", "--format=%cI"),
            "remote": run_git(repo_root, "config", "--get", "remote.origin.url"),
            "dirty": dirty,
            "dirty_file_count": len(dirty_files),
            "dirty_files_sample": dirty_files[:12],
        },
        "content": collect_watch_state(repo_root, [str(item) for item in args.watch_path if str(item).strip()], exclude_set),
        "notes": [str(item) for item in args.note if str(item).strip()],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an edge-truth receipt for a public surface.")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--surface-id", required=True)
    parser.add_argument("--product", required=True)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--kind", required=True)
    parser.add_argument("--builder", required=True)
    parser.add_argument("--served-path", action="append", default=[])
    parser.add_argument("--watch-path", action="append", default=[])
    parser.add_argument("--output", action="append", default=[])
    parser.add_argument("--note", action="append", default=[])
    parser.add_argument("--exclude-name", action="append", default=[])
    args = parser.parse_args()

    payload = build_receipt(args)
    repo_root = Path(args.repo_root).resolve()
    outputs = [resolve_path(str(item), repo_root) for item in args.output if str(item).strip()]
    for path in outputs:
        atomic_write_json(path, payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
