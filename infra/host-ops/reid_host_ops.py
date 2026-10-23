"""Private, authenticated executor for explicitly approved Ubuntu commands."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOKEN = os.environ.get("HOST_OPS_TOKEN", "").encode()
STATE = Path("/var/lib/reid-host-ops/executed.json")
HOST_WORKDIR = "/home/reid/Reid-web"
MAX_BODY = 32_768
MAX_COMMAND = 4_000
MAX_OUTPUT = 16_000
TIMEOUT_SECONDS = 300
STATE_LOCK = threading.Lock()
NON_INTERACTIVE = re.compile(r"(?:^|[;&|]\s*)(?:vim?|nano|less|more|top|htop|watch|man)(?:\s|$)", re.I)
CRITICAL = re.compile(
    r"(?:\brm\s+[^\n]*(?:-[^\n]*r|--recursive)|\b(?:mkfs|fdisk|parted|wipefs|dd)\b|"
    r"\b(?:reboot|shutdown|poweroff|halt)\b|\b(?:ufw|iptables|nft)\b|"
    r"\b(?:useradd|userdel|usermod|passwd|visudo)\b|\bchmod\s+(?:777|666)\b|"
    r"\b(?:apt|apt-get|dpkg)\s+(?:remove|purge|dist-upgrade|full-upgrade)\b|"
    r"\bsystemctl\s+(?:disable|mask)\b|\bdocker\s+(?:system\s+prune|volume\s+rm)\b)", re.I
)
WRITE = re.compile(
    r"(?:\b(?:apt|apt-get|dpkg|snap|pip|npm)\s+(?:install|update|upgrade)|"
    r"\b(?:systemctl|service)\s+(?:start|stop|restart|reload|enable)|"
    r"\bdocker(?:\s+compose)?\s+(?:build|up|down|restart|stop|rm|pull)|"
    r"\bgit\s+(?:pull|checkout|switch|merge|rebase|reset|clean)|"
    r"(?:^|[;&|]\s*)(?:cp|mv|rm|mkdir|touch|tee|sed\s+-i|chown|chmod)\b|"
    r">{1,2})", re.I
)
SHELL_COMPLEX = re.compile(r"[\n;&|`$<>]")
READ_ONLY = re.compile(
    r"(?:"
    r"uname(?:\s+[-A-Za-z0-9]+)*|uptime|whoami|id(?:\s+[-A-Za-z0-9]+)*|hostname(?:\s+[-A-Za-z0-9]+)*|date(?:\s+[-A-Za-z0-9:+.%]+)*|"
    r"df(?:\s+[^\s;&|`$<>]+)*|free(?:\s+[^\s;&|`$<>]+)*|ps(?:\s+[^\s;&|`$<>]+)*|ss(?:\s+[^\s;&|`$<>]+)*|"
    r"ip\s+(?:addr|address|route|link)(?:\s+[^\s;&|`$<>]+)*|"
    r"docker\s+ps(?:\s+[^\s;&|`$<>]+)*|docker\s+compose\s+ps(?:\s+[^\s;&|`$<>]+)*|"
    r"systemctl\s+(?:status|is-active|is-enabled|is-system-running)(?:\s+[^\s;&|`$<>]+)*|"
    r"git\s+(?:status|log|diff|show|branch|rev-parse)(?:\s+[^\s;&|`$<>]+)*"
    r")", re.I
)
SECRET_PATTERNS = [
    re.compile(r"(?im)^\s*[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*\s*=.*$"),
    re.compile(r"(?i)(?:api[_-]?key|token|secret|password|passwd|credential)\s*[=:]\s*[^\s'\"]+"),
    re.compile(r"\bsk_[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\btvly-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~-]{12,}"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
]

MANAGED_CONTAINERS = ("reid-web", "reid-services", "reid-tts", "reid-host-ops", "reid-ai-relay", "reid-agent-runner", "reid-tunnel", "reid-assistant")
WORKFLOWS = ("weekly-backup.yml", "executive-reports.yml", "live-agent.yml", "uptime.yml")


def host_read(argv: list[str]) -> str:
    result = subprocess.run(["nsenter", "--target", "1", "--mount", "--uts", "--ipc", "--net", "--pid",
                             f"--wdns={HOST_WORKDIR}", "--", *argv], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise ValueError("observation_unavailable")
    return (result.stdout + (result.stderr if argv[:2] == ["docker", "logs"] else ""))[:1_000_000]


def observe(data: dict) -> dict:
    """Fixed reads only. Never return container environment or log message bodies."""
    kind = data.get("kind")
    if kind == "containers":
        present = set(host_read(["docker", "ps", "-a", "--format", "{{.Names}}"]).splitlines())
        names = [name for name in MANAGED_CONTAINERS if name in present]
        rows = json.loads(host_read(["docker", "inspect", *names])) if names else []
        return {"containers": [{"name": row["Name"].lstrip("/"), "status": row["State"]["Status"],
                                "health": row["State"].get("Health", {}).get("Status", "unconfigured"),
                                "startedAt": row["State"].get("StartedAt"), "restartCount": row.get("RestartCount", 0),
                                "exitCode": row["State"].get("ExitCode"), "oomKilled": row["State"].get("OOMKilled", False)} for row in rows]}
    if kind == "logs":
        name = data.get("container")
        if name not in MANAGED_CONTAINERS:
            raise ValueError("container_not_allowed")
        # Raw logs can contain customer messages, URLs and tokens. Only expose
        # severity/time and a conservative event identifier from JSON logs.
        raw = host_read(["docker", "logs", "--tail", "100", "--since", "1h", name])
        events = []
        for line in raw.splitlines()[-100:]:
            try:
                row = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(row, dict):
                continue
            event = str(row.get("event", ""))
            events.append({"level": row.get("level") if isinstance(row.get("level"), (int, float)) else None,
                           "time": row.get("time") if isinstance(row.get("time"), (int, float)) else None,
                           "event": event if re.fullmatch(r"[a-z_]{3,64}", event) else "structured_log"})
        return {"container": name, "events": events, "scope": "structured_metadata_only"}
    if kind == "workflows":
        latest = {}
        def get_run(filename):
            payload = json.loads(host_read(["runuser", "-u", "reid", "--", "gh", "api",
                f"repos/accelerator007/Reid/actions/workflows/{filename}/runs?per_page=1"]))
            return filename, payload.get("workflow_runs", [])
        with ThreadPoolExecutor(max_workers=4) as pool:
            for filename, rows in pool.map(get_run, WORKFLOWS):
                if not rows:
                    continue
                row = rows[0]
                latest[filename] = {"id": row["id"], "status": row["status"], "conclusion": row["conclusion"],
                                    "createdAt": row["created_at"], "updatedAt": row["updated_at"], "url": row["html_url"]}
        backup = latest.get("weekly-backup.yml")
        if backup:
            artifacts = json.loads(host_read(["runuser", "-u", "reid", "--", "gh", "api",
                f"repos/accelerator007/Reid/actions/runs/{int(backup['id'])}/artifacts"]))
            backup["artifacts"] = [{"name": item["name"], "sizeBytes": item["size_in_bytes"], "expired": item["expired"]}
                                   for item in artifacts.get("artifacts", []) if item["name"].startswith("reid-db-backup-")]
        return {"workflows": latest}
    raise ValueError("observation_not_allowed")


def risk_for(command: str) -> str:
    if CRITICAL.search(command):
        return "critical"
    # Shell composition can hide a second command or generate one at runtime.
    # Preserve full Owner control, but always require the per-action critical
    # code for a pipeline, substitution, redirection, or command chain.
    if SHELL_COMPLEX.search(command):
        return "critical"
    if WRITE.search(command):
        return "write"
    if READ_ONLY.fullmatch(command.strip()):
        return "read"
    # Unknown programs are powerful by default. They remain executable after
    # the Owner sees the exact command and supplies its unique critical code.
    return "critical"


def validate_command(command: object) -> tuple[str, str]:
    value = str(command or "").strip()
    if not value or len(value) > MAX_COMMAND or "\x00" in value or "\r" in value:
        raise ValueError("invalid_command")
    if NON_INTERACTIVE.search(value):
        raise ValueError("interactive_command_not_supported")
    return value, risk_for(value)


def redact(value: str) -> str:
    result = value
    for pattern in SECRET_PATTERNS:
        result = pattern.sub("[SECRET REDACTED]", result)
    return result[-MAX_OUTPUT:]


def load_state() -> dict[str, dict[str, object]]:
    try:
        value = json.loads(STATE.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(value: dict[str, dict[str, object]]) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="executed-", dir=STATE.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(value, handle, separators=(",", ":"))
        os.chmod(name, 0o600)
        os.replace(name, STATE)
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass


def execute(action_id: str, command: str) -> dict[str, object]:
    try:
        uuid.UUID(action_id)
    except ValueError as exc:
        raise ValueError("invalid_action_id") from exc
    command, risk = validate_command(command)
    digest = hashlib.sha256(command.encode()).hexdigest()
    with STATE_LOCK:
        state = load_state()
        previous = state.get(action_id)
        if previous:
            if previous.get("command_sha256") != digest:
                raise ValueError("action_replay_mismatch")
            return {**previous, "replayed": True}

        started = time.monotonic()
        process = subprocess.run(
            [
                "nsenter", "--target", "1", "--mount", "--uts", "--ipc", "--net", "--pid",
                f"--wdns={HOST_WORKDIR}", "--", "/bin/bash", "--noprofile", "--norc", "-lc", command,
            ],
            text=True, capture_output=True, timeout=TIMEOUT_SECONDS,
            env={"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C.UTF-8"},
        )
        output = redact("\n".join(part for part in (process.stdout.strip(), process.stderr.strip()) if part))
        result = {
            "command_sha256": digest,
            "risk": risk,
            "exit_code": process.returncode,
            "output": output,
            "duration_ms": round((time.monotonic() - started) * 1000),
            "completed_at": int(time.time()),
            "replayed": False,
        }
        state[action_id] = result
        save_state(dict(list(state.items())[-500:]))
        return result


class Handler(BaseHTTPRequestHandler):
    server_version = "ReidHostOps/1.0"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def reply(self, status: int, body: dict[str, object]) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self.reply(200 if TOKEN else 503, {"ok": bool(TOKEN), "executor": "host", "approval_required": True})
        else:
            self.reply(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        if length < 2 or length > MAX_BODY:
            self.reply(400, {"error": "invalid_body"})
            return
        raw = self.rfile.read(length)
        timestamp = self.headers.get("X-Reid-Timestamp", "")
        nonce = self.headers.get("X-Reid-Nonce", "")
        signature = self.headers.get("X-Reid-Signature", "")
        try:
            current = int(time.time())
            supplied = int(timestamp)
        except ValueError:
            self.reply(401, {"error": "unauthorized"})
            return
        signed = timestamp.encode() + b"." + nonce.encode() + b"." + raw
        expected = hmac.new(TOKEN, signed, hashlib.sha256).hexdigest()
        if not TOKEN or abs(current - supplied) > 60 or len(nonce) < 16 or not hmac.compare_digest(expected, signature):
            self.reply(401, {"error": "unauthorized"})
            return
        try:
            data = json.loads(raw)
            if self.path == "/v1/observe":
                self.reply(200, observe(data))
                return
            command, risk = validate_command(data.get("command"))
            if self.path == "/v1/validate":
                self.reply(200, {"ok": True, "risk": risk, "command_sha256": hashlib.sha256(command.encode()).hexdigest()})
                return
            if self.path != "/v1/execute":
                self.reply(404, {"error": "not_found"})
                return
            result = execute(str(data.get("action_id", "")), command)
            self.reply(200, {"ok": result["exit_code"] == 0, **result})
        except (json.JSONDecodeError, ValueError) as exc:
            self.reply(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            self.reply(504, {"error": "command_timeout"})
        except OSError:
            self.reply(503, {"error": "executor_unavailable"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8787), Handler).serve_forever()
