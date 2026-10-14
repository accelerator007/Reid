#!/usr/bin/env bash
# Run as the existing ai-lap service user with shell access, on the laptop.
set -euo pipefail
bundle_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target_dir="$HOME/reid-ai"
config_file="$HOME/.config/reid-ai/adapter.env"
test -f "$config_file" || { echo 'Existing adapter.env is required; no credentials are created.' >&2; exit 1; }
test -f "$target_dir/reid_ollama_adapter.py"
python3 -m unittest discover -s "$bundle_dir" -p 'test_*.py'
mkdir -p "$HOME/.local/state"
backup_dir="$(mktemp -d "$HOME/.local/state/reid-ai-update.XXXXXXXX")"
cp "$target_dir/reid_ollama_adapter.py" "$backup_dir/"
rollback() {
  cp "$backup_dir/reid_ollama_adapter.py" "$target_dir/reid_ollama_adapter.py"
  systemctl --user restart reid-ollama-adapter.service || true
  echo "Update failed; restored adapter from $backup_dir" >&2
}
trap rollback ERR
install -m 644 "$bundle_dir/reid_ollama_adapter.py" "$target_dir/reid_ollama_adapter.py"
systemctl --user restart reid-ollama-adapter.service
python3 - "$config_file" <<'PY'
import json, sys, time, urllib.request
values={}
for line in open(sys.argv[1]):
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.strip().split('=',1)
        values[key]=value.strip('"\'')
for attempt in range(15):
    try:
        request=urllib.request.Request('http://127.0.0.1:'+values.get('REID_ADAPTER_PORT','11436')+'/health',headers={'x-reid-origin-token':values.get('REID_ORIGIN_TOKEN','')})
        with urllib.request.urlopen(request,timeout=5) as response:
            result=json.load(response)
        if result.get('ok') and result.get('version')=='1.3.0':
            print('Adapter 1.3.0 is healthy.')
            break
    except Exception:
        pass
    time.sleep(1)
else:
    sys.exit('Adapter verification failed.')
PY
trap - ERR
echo "Adapter updated. Backup: $backup_dir"
echo 'The legacy laptop worker was not restarted; the current runner lives on the Reid host.'
