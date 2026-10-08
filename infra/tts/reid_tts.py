"""Small local Piper service that returns WhatsApp-ready Opus voice notes."""

from __future__ import annotations

import io
import json
import os
import subprocess
import threading
import urllib.error
import urllib.parse
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from piper import PiperVoice
from piper.config import SynthesisConfig


VOICE_PATHS = {
    "ar": Path("/voices/ar_JO-kareem-medium.onnx"),
    "en": Path("/voices/en_US-lessac-medium.onnx"),
}
VOICES = {language: PiperVoice.load(path) for language, path in VOICE_PATHS.items()}
SYNTHESIS_LOCK = threading.Lock()
MAX_TEXT = 1800
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
ELEVENLABS_MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v4").strip()


def synthesize_local(text: str, language: str) -> bytes:
    voice = VOICES.get(language, VOICES["ar"])
    wav_io = io.BytesIO()
    # A slightly quicker cadence sounds more like a voice note than narration.
    config = SynthesisConfig(length_scale=0.92, noise_scale=0.62, noise_w_scale=0.78)
    with SYNTHESIS_LOCK, wave.open(wav_io, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file, syn_config=config)
    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0",
            "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k",
            "-vbr", "on", "-application", "voip", "-f", "ogg", "pipe:1",
        ],
        input=wav_io.getvalue(), capture_output=True, check=True, timeout=60,
    )
    return result.stdout


def elevenlabs_script(text: str, language: str) -> str:
    # v4 responds well to a short delivery cue. Keep it out of the WhatsApp
    # transcript: it controls performance and is never part of what Reid says.
    # The Fahad voice already carries the Saudi/Gulf accent; Reid's response
    # wording supplies the light Bedouin dialect without caricaturing it.
    if ELEVENLABS_MODEL_ID in {"eleven_v3", "eleven_v4"}:
        cue = "[warmly] [conversational]" if language == "ar" else "[conversational]"
        return f"{cue} {text}"
    return text


def synthesize_elevenlabs(text: str, language: str) -> bytes:
    if not ELEVENLABS_API_KEY or not ELEVENLABS_VOICE_ID:
        raise ValueError("elevenlabs_not_configured")
    voice = urllib.parse.quote(ELEVENLABS_VOICE_ID, safe="")
    endpoint = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=opus_48000_32"
    payload = json.dumps({
        "text": elevenlabs_script(text, language),
        "model_id": ELEVENLABS_MODEL_ID,
        "language_code": language,
        "voice_settings": {
            "stability": 0.50,
            "similarity_boost": 0.82,
            "style": 0.0,
            "use_speaker_boost": True,
            "speed": 0.96,
        },
    }).encode()
    request = urllib.request.Request(endpoint, data=payload, method="POST", headers={
        "Accept": "audio/ogg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
    })
    with urllib.request.urlopen(request, timeout=75) as response:
        audio = response.read(12 * 1024 * 1024 + 1)
    if len(audio) > 12 * 1024 * 1024 or audio[:4] != b"OggS":
        raise OSError("elevenlabs_invalid_audio")
    return audio


def synthesize(text: str, language: str) -> tuple[bytes, str]:
    if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID:
        try:
            return synthesize_elevenlabs(text, language), "elevenlabs"
        except (OSError, TimeoutError, urllib.error.URLError, urllib.error.HTTPError):
            # Voice delivery is more important than provider availability. The
            # pinned local voice remains a private, deterministic fallback.
            pass
    return synthesize_local(text, language), "piper"


class Handler(BaseHTTPRequestHandler):
    server_version = "ReidVoice/1.0"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def reply_json(self, status: int, value: dict[str, object]) -> None:
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/healthz":
            self.reply_json(404, {"error": "not_found"})
            return
        self.reply_json(200, {
            "ok": True,
            "voices": sorted(VOICES),
            "primary": "elevenlabs" if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID else "piper",
            "model": ELEVENLABS_MODEL_ID if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID else "piper",
            "fallback": "piper",
        })

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/synthesize":
            self.reply_json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 16_000:
                raise ValueError("invalid_body")
            data = json.loads(self.rfile.read(length))
            text = str(data.get("text", "")).strip()
            language = str(data.get("language", "ar")).lower()
            if not text or len(text) > MAX_TEXT or language not in VOICES:
                raise ValueError("invalid_request")
            audio, provider = synthesize(text, language)
            self.send_response(200)
            self.send_header("Content-Type", "audio/ogg; codecs=opus")
            self.send_header("X-Reid-Voice-Provider", provider)
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except (ValueError, json.JSONDecodeError):
            self.reply_json(400, {"error": "invalid_request"})
        except (subprocess.SubprocessError, OSError, urllib.error.URLError):
            self.reply_json(503, {"error": "synthesis_failed"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 5050), Handler).serve_forever()
