#!/usr/bin/env python3
"""Minimal loopback-only, authenticated Ollama adapter for Reid."""
from __future__ import annotations

import hmac
import base64
import json
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("REID_ADAPTER_PORT", "11436"))
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
IMAGE_SERVER = os.environ.get("REID_IMAGE_URL", "http://127.0.0.1:11437")
TOKEN = os.environ.get("REID_ORIGIN_TOKEN", "")
CHAT_MODEL = os.environ.get("REID_CHAT_MODEL", "gemma4:12b")
EMBED_MODEL = os.environ.get("REID_EMBED_MODEL", "nomic-embed-text:latest")
MAX_BODY = 24 * 1024 * 1024
TIMEOUT = 120
MAX_AUDIO = 16 * 1024 * 1024
TRANSCRIBE_MODEL = os.environ.get("REID_TRANSCRIBE_MODEL", "small")
VERSION = "1.3.0"
CAPABILITIES = ["chat", "json", "vision", "embeddings", "transcription", "images"]
_transcriber = None
_transcriber_lock = threading.Lock()


def transcriber():
    global _transcriber
    if _transcriber is None:
        from faster_whisper import WhisperModel
        _transcriber = WhisperModel(TRANSCRIBE_MODEL, device="cuda", compute_type="float16")
    return _transcriber


# One decoding profile per job, instead of one setting for every call. The old
# fixed temperature of 0.15 is correct for extraction and makes conversation
# repeat itself word for word, which is what made the assistant read as a
# machine. Callers that ask for nothing keep exactly the previous behaviour.
CHAT_PROFILES = {
    "chat": {"temperature": 0.75, "top_p": 0.92, "repeat_penalty": 1.15, "num_ctx": 16384, "num_predict": 1024},
    "intent": {"temperature": 0.1, "top_p": 0.9, "repeat_penalty": 1.05, "num_ctx": 8192, "num_predict": 512},
    "report": {"temperature": 0.35, "top_p": 0.9, "repeat_penalty": 1.1, "num_ctx": 16384, "num_predict": 3072},
    "strict": {"temperature": 0.15, "top_p": 0.9, "repeat_penalty": 1.05, "num_ctx": 16384, "num_predict": 3072},
}
DEFAULT_PROFILE = "strict"
OPTION_BOUNDS = {"temperature": (0.0, 1.2), "top_p": (0.1, 1.0), "repeat_penalty": (1.0, 2.0)}


TRANSCRIBE_LANGUAGES = frozenset({"ar", "en"})


def transcribe_language(body: dict) -> str | None:
    """An optional language hint. Short Gulf Arabic phrases such as "تم" are
    easily auto-detected as English; callers that know the speaker's language
    pass it. Anything else keeps Whisper's automatic detection."""
    wanted = body.get("language")
    return wanted if isinstance(wanted, str) and wanted in TRANSCRIBE_LANGUAGES else None


def chat_options(body: dict) -> tuple[str, dict]:
    """Resolve a decoding profile and clamp any caller override into safe bounds."""
    wanted = body.get("profile")
    name = wanted if isinstance(wanted, str) and wanted in CHAT_PROFILES else DEFAULT_PROFILE
    options = dict(CHAT_PROFILES[name])
    supplied = body.get("options")
    if isinstance(supplied, dict):
        for key, (low, high) in OPTION_BOUNDS.items():
            value = supplied.get(key)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                options[key] = min(max(float(value), low), high)
        predict = supplied.get("num_predict")
        if isinstance(predict, int) and not isinstance(predict, bool):
            options["num_predict"] = min(max(predict, 64), 4096)
    return name, options


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
            started = time.monotonic()
            with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=5) as response:
                tags = json.load(response)
            names = {row.get("name") for row in tags.get("models", [])}
            ready = CHAT_MODEL in names and any(name in names for name in (EMBED_MODEL, EMBED_MODEL.removesuffix(":latest")))
            return self.reply(200 if ready else 503, {"ok": ready, "version": VERSION, "chat": CHAT_MODEL, "embedding": EMBED_MODEL, "ollama_latency_ms": round((time.monotonic() - started) * 1000), "capabilities": CAPABILITIES})
        except Exception:
            return self.reply(503, {"ok": False, "error": "ollama_unavailable"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/api/chat", "/api/embeddings", "/api/transcribe", "/api/images"):
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

        if self.path == "/api/images":
            prompt = body.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
                return self.reply(400, {"error": "invalid_image_prompt"})
            request = urllib.request.Request(
                f"{IMAGE_SERVER}/generate", data=json.dumps(body).encode(),
                headers={"content-type": "application/json"}, method="POST"
            )
            try:
                # Image inference and gemma4 share one 12 GB GPU. Explicitly
                # release Ollama's resident model before handing it to SDXL.
                self.request_ollama("/api/generate", {"model": CHAT_MODEL, "keep_alive": 0})
                # First boot may include a one-time model download. Normal warm
                # generations complete much sooner, but do not fail that setup.
                with urllib.request.urlopen(request, timeout=900) as response:
                    return self.reply(200, json.load(response))
            except urllib.error.HTTPError as error:
                return self.reply(502, {"error": "image_server_rejected", "status": error.code})
            except Exception:
                return self.reply(504, {"error": "image_server_unavailable"})

        if self.path == "/api/chat":
            messages = body.get("messages")
            if not isinstance(messages, list) or not messages or len(messages) > 32:
                return self.reply(400, {"error": "invalid_messages"})
            _, options = chat_options(body)
            upstream = {"model": CHAT_MODEL, "stream": False, "think": False, "messages": messages, "options": options}
            # JSON mode is the only format the adapter forwards. It makes a
            # structured extraction parseable instead of hopeful, and it cannot
            # widen what the model is allowed to reach.
            if body.get("format") == "json":
                upstream["format"] = "json"
            return self.proxy("/api/chat", upstream)

        if self.path == "/api/transcribe":
            encoded = body.get("audio")
            mime = body.get("mimetype", "audio/ogg")
            if not isinstance(encoded, str) or not mime.startswith("audio/"):
                return self.reply(400, {"error": "invalid_audio"})
            try:
                raw = base64.b64decode(encoded, validate=True)
            except (ValueError, TypeError):
                return self.reply(400, {"error": "invalid_audio_encoding"})
            if not raw or len(raw) > MAX_AUDIO:
                return self.reply(413, {"error": "audio_size_not_allowed"})
            suffixes = {"audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav"}
            path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=suffixes.get(mime.split(";")[0], ".audio"), delete=False) as temp:
                    temp.write(raw)
                    path = temp.name
                with _transcriber_lock:
                    segments, info = transcriber().transcribe(
                        path, beam_size=5, vad_filter=True, language=transcribe_language(body))
                    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
                return self.reply(200, {"text": text[:16000], "language": info.language})
            except Exception:
                return self.reply(502, {"error": "transcription_failed"})
            finally:
                if path:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass

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
