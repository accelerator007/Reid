#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_path="${1:-/tmp/reid-ai-lap-update.tar.gz}"
tar -czf "$artifact_path" -C "$repo_dir/infra/ai-lap" \
  install-update.sh reid_ollama_adapter.py reid_agent_runner.py agent_quality.py \
  test_adapter.py test_runner.py test_agent_quality.py
sha256sum "$artifact_path"
