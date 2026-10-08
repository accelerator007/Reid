FROM python:3.12-slim

ARG PIPER_VERSION=1.8.0
ARG VOICES_REV=5b44ec7bab7c5822cfec48fbd5aa99db71a823d6

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
  && python -m pip install --no-cache-dir "piper-tts==${PIPER_VERSION}" \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /service
RUN mkdir -p /voices \
  && curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/${VOICES_REV}/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx" -o /voices/ar_JO-kareem-medium.onnx \
  && curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/${VOICES_REV}/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json" -o /voices/ar_JO-kareem-medium.onnx.json \
  && curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/${VOICES_REV}/en/en_US/lessac/medium/en_US-lessac-medium.onnx" -o /voices/en_US-lessac-medium.onnx \
  && curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/${VOICES_REV}/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" -o /voices/en_US-lessac-medium.onnx.json \
  && printf '%s  %s\n' \
    '9e95cab07b679da603bba17c4dec7ab3111320571964ee95c0379603c086491e' '/voices/ar_JO-kareem-medium.onnx' \
    'ea6d9b9d9076dbdb6bf5c98c6a141ef154959d2359709b37855727964e7d6c4d' '/voices/ar_JO-kareem-medium.onnx.json' \
    '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f' '/voices/en_US-lessac-medium.onnx' \
    'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0' '/voices/en_US-lessac-medium.onnx.json' \
    | sha256sum -c -

COPY reid_tts.py ./reid_tts.py
RUN useradd --uid 10001 --create-home reid && chown -R reid:reid /service /voices
USER reid

EXPOSE 5050
HEALTHCHECK --interval=20s --timeout=5s --start-period=45s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5050/healthz', timeout=3)" || exit 1
CMD ["python", "-B", "reid_tts.py"]
