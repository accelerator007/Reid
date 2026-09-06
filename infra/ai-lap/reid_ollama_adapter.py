#!/usr/bin/env python3
"""Minimal loopback-only, authenticated Ollama adapter for Reid."""
from __future__ import annotations

import hmac
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("REID_ADAPTER_PORT", "11436"))
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
TOKEN = os.environ.get("REID_ORIGIN_TOKEN", "")
CHAT_MODEL = os.environ.get("REID_CHAT_MODEL", "gemma4:12b")
EMBED_MODEL = os.environ.get("REID_EMBED_MODEL", "nomic-embed-text:latest")
MAX_BODY = 64 * 1024
TIMEOUT = 120


class Handler(BaseHTTPRequestHandler):
    server_version = "ReidOllamaAdapter/1"

    def log_message(self, fmt: str, *args: object) -> None:
        # Never log prompts, headers, response bodies, or credentials.
        print(json.dumps({"method": self.command, "path": self.path, "status": args[1] if len(args) > 1 else None}))

    def reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorized(self) -> bool:
        supplied = self.headers.get("x-reid-origin-token", "")
        return bool(TOKEN) and hmac.compare_digest(supplied.encode(), TOKEN.encode())

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            return self.reply(404, {"error": "not_found"})
        if not self.authorized():
            return self.reply(401, {"error": "unauthorized"})
        try:
            with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=5) as response:
                tags = json.load(response)
            names = {row.get("name") for row in tags.get("models", [])}
            ready = CHAT_MODEL in names and any(name in names for name in (EMBED_MODEL, EMBED_MODEL.removesuffix(":latest")))
            return self.reply(200 if ready else 503, {"ok": ready, "chat": CHAT_MODEL, "embedding": EMBED_MODEL})
        except Exception:
            return self.reply(503, {"ok": False, "error": "ollama_unavailable"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/api/chat", "/api/embeddings"):
            return self.reply(404, {"error": "endpoint_not_allowed"})
        if not self.authorized():
            return self.reply(401, {"error": "unauthorized"})
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            return self.reply(400, {"error": "invalid_content_length"})
        if length < 1 or length > MAX_BODY:
            return self.reply(413, {"error": "request_too_large"})
        try:
            body = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, {"error": "invalid_json"})

        if self.path == "/api/chat":
            messages = body.get("messages")
            if not isinstance(messages, list) or not messages or len(messages) > 32:
                return self.reply(400, {"error": "invalid_messages"})
            upstream = {"model": CHAT_MODEL, "stream": False, "think": False, "messages": messages,
                        "options": {"temperature": 0.2, "num_predict": 2048}}
            return self.proxy("/api/chat", upstream)

        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16000:
            return self.reply(400, {"error": "invalid_embedding_input"})
        result = self.request_ollama("/api/embed", {"model": EMBED_MODEL, "input": prompt, "truncate": True})
        if isinstance(result, tuple):
            return self.reply(*result)
        embeddings = result.get("embeddings") or []
        return self.reply(200, {"embedding": embeddings[0] if embeddings else []})

    def request_ollama(self, path: str, payload: dict):
        request = urllib.request.Request(f"{OLLAMA}{path}", data=json.dumps(payload).encode(),
                                         headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            return (502, {"error": "ollama_rejected", "status": error.code})
        except Exception:
            return (504, {"error": "ollama_timeout_or_unavailable"})

    def proxy(self, path: str, payload: dict) -> None:
        result = self.request_ollama(path, payload)
        if isinstance(result, tuple):
            return self.reply(*result)
        return self.reply(200, result)


if __name__ == "__main__":
    if len(TOKEN) < 32:
        raise SystemExit("REID_ORIGIN_TOKEN must be at least 32 characters")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
