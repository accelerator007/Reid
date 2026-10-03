"""Small local Piper service that returns WhatsApp-ready Opus voice notes."""

from __future__ import annotations

import io
import json
import subprocess
import threading
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


def synthesize(text: str, language: str) -> bytes:
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
        self.reply_json(200, {"ok": True, "voices": sorted(VOICES)})

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
            audio = synthesize(text, language)
            self.send_response(200)
            self.send_header("Content-Type", "audio/ogg; codecs=opus")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except (ValueError, json.JSONDecodeError):
            self.reply_json(400, {"error": "invalid_request"})
        except (subprocess.SubprocessError, OSError):
            self.reply_json(503, {"error": "synthesis_failed"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 5050), Handler).serve_forever()
