# ai-lap secure Ollama integration plan

Status: outbound runner deployed to Supabase on 2026-09-06; local adapter passed live tests. Final runner-service installation is waiting for `ai-lap` to return to the network.

## Verified host state

- Host: `ai-lap` (reported hostname `Admin`), Ubuntu 22.04.
- RAM: 31 GiB total, about 25 GiB available during the audit.
- GPU: NVIDIA GeForce RTX 3080 Ti, 12,288 MiB VRAM, driver 591.86.
- Ollama: 0.33.2, systemd service active, listening only on `127.0.0.1:11434`.
- Required chat model: `gemma4:12b`, 7.6 GB, present locally.
- Embedding model: `nomic-embed-text:latest`, 274 MB, present locally.
- Health endpoint passed. `gemma4:12b` returned `REID_OK` with `think:false`; the measured warm request was about 7 seconds. With thinking enabled and a low output ceiling, the model consumed the allowance as hidden thinking and returned empty content. The production adapter must therefore set `think:false` unless a separately budgeted reasoning run is explicitly requested.
- `cloudflared` is installed. Its service was still activating during the audit; no tunnel configuration was assumed or changed.

## Implemented architecture

```text
Reid browser
  -> Supabase llm-gateway (JWT, RBAC, classification, L0-L4 approval, audit)
    -> private queued job in Supabase
      <- authenticated outbound HTTPS poll from ai-lap runner
        -> Reid local Ollama adapter on 127.0.0.1:11436
          -> Ollama on 127.0.0.1:11434
      -> result, embedding, audit status and heartbeat written back to Supabase
```

Ollama ports remain loopback-only and are never exposed directly. The local adapter uses `127.0.0.1:11436`; `11435` was already held by the Ollama service during installation. The adapter is mandatory because raw Ollama exposes administrative/model-management endpoints. It accepts only bounded `POST /api/chat`, `POST /api/embeddings`, and `GET /health`, whitelists `gemma4:12b` and `nomic-embed-text`, rejects model pulls/deletes and arbitrary URLs, caps request/response sizes, sets timeouts, redacts logs, and requires a separate origin token.

The Cloudflare Tunnel design was tested and rejected on this network: even forced HTTP/2 required outbound TCP 7844, which timed out. The outbound runner uses normal HTTPS 443, creates no public hostname, and requires a separate 256-bit bearer credential stored only on ai-lap and in Supabase secrets.

## Provider and routing policy

- Keep both `ollama` and `gemini` rows. Never delete Gemini when local AI is enabled.
- After the live security tests pass, set Ollama to enabled with chat model `gemma4:12b`, embedding model `nomic-embed-text`, and `restricted` clearance.
- Route HR, Finance, Sales/CRM, Knowledge/RAG and CEO company-context work to Ollama first.
- Route Operations/Analytics/Support to Ollama first; allow Gemini fallback only when the Owner-configured classification permits it.
- Marketing, Content and Competitor Intelligence may retain Gemini as a public-data fallback.
- A local outage must never silently send restricted data to Gemini. The gateway records `provider_unavailable` and asks for an explicit retry/provider decision.
- Existing agent prompts, tool assignments, memory scopes and approval levels stay unchanged; switching provider does not broaden an agent's permissions.

## Delivery phases

### 1. Harden ai-lap

1. Create a dedicated non-login `reid-agent` service account.
2. Install the versioned local adapter as a systemd user service on `127.0.0.1:11436`.
3. Enforce model/path allow-lists, `think:false`, request limits, concurrency 1 initially, a 120-second generation timeout and a shorter embedding timeout.
4. Keep Ollama on `127.0.0.1:11434`; verify firewall rules expose neither 11434 nor 11435 on LAN/WAN.
5. Add health checks for Ollama, both required models, GPU memory and disk space. Logs must not contain prompts, CV text, HR records or credentials.

### 2. Private outbound path

1. `ai-lap-runner` Edge Function exposes claim/complete/fail/heartbeat only and authenticates a dedicated bearer secret.
2. `reid_agent_runner.py` polls it over HTTPS 443, then calls the loopback-only adapter.
3. Jobs are claimed atomically; a runner crash requeues a job only after a 15-minute stale window.
4. The browser has neither the runner credential nor Supabase service-role access.
5. `agent_runner_status` records last heartbeat, version, model and GPU for the Owner map.

### 3. Reid gateway integration

1. Queue local model requests instead of attempting an inbound call from Supabase.
2. Add provider heartbeat, timeout recovery and explicit failure behavior.
3. Update the `ollama` provider to exact models and enable it after runner tests pass.
4. Add an Owner-only provider routing control and show local health/last heartbeat on the Agent Map.
5. Preserve prompt hashing, bounded output previews, tool approvals and execution receipts.

### 4. Memory and RAG

1. Verify `nomic-embed-text` dimensions and normalize or reject vectors before writing the existing `vector(768)` column.
2. Index only text the requesting agent is authorized to read; attach source, scope and classification metadata.
3. Retrieve by scope (`user`, `project`, `department`, `company`, `agent`) plus ACL before similarity search.
4. Add document citations and refuse answers when no authorized evidence is found.

### 5. Mandatory verification and rollout

1. Unit: adapter validation, redaction, size/time limits, `think:false`, model allow-list and fallback classification.
2. Integration: Cloudflare Access allow/deny, tunnel restart, Ollama restart, malformed provider response and timeout.
3. RLS: all roles against memories, agent runs, tools and execution receipts.
4. Live: one disposable Owner run per classification, L2 approval, L3 approval, tool execution, memory write/retrieval and cleanup.
5. Load: concurrency 1/2/4, VRAM/RAM, latency and failure rate; keep the safest stable concurrency.
6. Roll out Knowledge first, then Operations/Analytics/Support, Sales, HR/Finance, and CEO last.
7. Production requires passing CI/Staging, an Owner-approved PR, documented rollback and an updated `AGENTS.md` verification entry.

## Rollback

- Disable the Ollama provider and tunnel; do not delete either provider row or local models.
- Public agents may use Gemini within its quota and classification policy.
- Sensitive runs remain queued/failed safely rather than falling back across the configured data boundary.
- Tool execution continues because database tools do not require a model provider call.

## Human/external prerequisites

- `ai-lap` must be reachable over SSH once more so the already-prepared outbound runner and its user service can be installed and live-tested.
- No Cloudflare Access token, DNS record, inbound firewall rule, or public Ollama hostname is required.
