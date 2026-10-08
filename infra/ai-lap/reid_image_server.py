#!/usr/bin/env python3
"""Loopback-only image generation service for Reid.

The authenticated Ollama adapter is the only caller. Model files and generated
pixels stay on ai-lap; the service never listens on a public interface.
"""
from __future__ import annotations

import base64
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image
from PIL import Image

HOST = "127.0.0.1"
PORT = int(os.environ.get("REID_IMAGE_PORT", "11437"))
MODEL = os.environ.get("REID_IMAGE_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
MAX_BODY = 8 * 1024 * 1024
LOCK = threading.Lock()
_text_pipe = None
_edit_pipe = None


def text_pipe():
    global _text_pipe
    if _text_pipe is None:
        _text_pipe = AutoPipelineForText2Image.from_pretrained(
            MODEL, torch_dtype=torch.float16, variant="fp16", use_safetensors=True
        )
        _text_pipe.enable_model_cpu_offload()
        _text_pipe.enable_vae_slicing()
    return _text_pipe


def edit_pipe():
    global _edit_pipe
    if _edit_pipe is None:
        _edit_pipe = AutoPipelineForImage2Image.from_pipe(text_pipe())
    return _edit_pipe


def dimensions(ratio: str) -> tuple[int, int]:
    return {
        "1:1": (768, 768), "4:5": (640, 800), "9:16": (576, 1024),
        "16:9": (1024, 576), "3:2": (960, 640), "2:3": (640, 960),
    }.get(ratio, (768, 768))


class Handler(BaseHTTPRequestHandler):
    server_version = "ReidImageServer/1"

    def log_message(self, fmt: str, *args: object) -> None:
        print(json.dumps({"path": self.path, "status": args[1] if len(args) > 1 else None}))

    def reply(self, status: int, payload: dict) -> None:
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        self.reply(200, {"ok": True, "model": MODEL}) if self.path == "/health" else self.reply(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/generate":
            return self.reply(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("content-length", "0"))
            if length < 1 or length > MAX_BODY:
                return self.reply(413, {"error": "request_too_large"})
            body = json.loads(self.rfile.read(length))
            prompt = str(body.get("prompt", "")).strip()
            if not prompt or len(prompt) > 4000:
                return self.reply(400, {"error": "invalid_prompt"})
            width, height = dimensions(str(body.get("aspect_ratio", "1:1")))
            kwargs = dict(
                prompt=prompt, width=width, height=height,
                negative_prompt="blurry, low quality, collage, mood board, color swatches, duplicate subject, malformed anatomy, watermark, logo, gibberish text, typography",
                num_inference_steps=28, guidance_scale=7.0,
            )
            encoded_source = body.get("image")
            with LOCK, torch.inference_mode():
                if encoded_source:
                    source = Image.open(io.BytesIO(base64.b64decode(encoded_source, validate=True))).convert("RGB").resize((width, height))
                    pipe = edit_pipe()
                    image = pipe(image=source, strength=0.65, **kwargs).images[0]
                else:
                    pipe = text_pipe()
                    image = pipe(**kwargs).images[0]
                pipe.maybe_free_model_hooks()
            output = io.BytesIO()
            image.save(output, "PNG", optimize=True)
            self.reply(200, {"image": base64.b64encode(output.getvalue()).decode(), "model": MODEL})
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            self.reply(503, {"error": "image_gpu_memory_exhausted"})
        except Exception as error:
            self.reply(500, {"error": "image_generation_failed", "detail": type(error).__name__})


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
