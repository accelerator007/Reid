# ai-lap secure Ollama integration plan

Status: planned after a successful read-only host audit on 2026-09-06. Do not enable the Supabase provider until every security and rollback gate below passes.

## Verified host state

- Host: `ai-lap` (reported hostname `Admin`), Ubuntu 22.04.
- RAM: 31 GiB total, about 25 GiB available during the audit.
- GPU: NVIDIA GeForce RTX 3080 Ti, 12,288 MiB VRAM, driver 591.86.
- Ollama: 0.33.2, systemd service active, listening only on `127.0.0.1:11434`.
- Required chat model: `gemma4:12b`, 7.6 GB, present locally.
- Embedding model: `nomic-embed-text:latest`, 274 MB, present locally.
- Health endpoint passed. `gemma4:12b` returned `REID_OK` with `think:false`; the measured warm request was about 7 seconds. With thinking enabled and a low output ceiling, the model consumed the allowance as hidden thinking and returned empty content. The production adapter must therefore set `think:false` unless a separately budgeted reasoning run is explicitly requested.
- `cloudflared` is installed. Its service was still activating during the audit; no tunnel configuration was assumed or changed.

## Target architecture

```text
Reid browser
  -> Supabase llm-gateway (JWT, RBAC, classification, L0-L4 approval, audit)
    -> Cloudflare Access (service-token authentication)
      -> outbound-only Cloudflare Tunnel from ai-lap
        -> Reid local Ollama adapter on 127.0.0.1:11435
          -> Ollama on 127.0.0.1:11434
```

Ollama port 11434 remains loopback-only and is never exposed directly. The local adapter is mandatory because a raw Ollama tunnel would expose administrative/model-management endpoints. It will accept only bounded `POST /chat`, `POST /embed`, and `GET /health`, whitelist `gemma4:12b` and `nomic-embed-text`, reject model pulls/deletes and arbitrary URLs, cap request/response sizes, set timeouts/concurrency, redact logs, and require the request identity forwarded by Cloudflare Access.

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
2. Install the versioned local adapter as a systemd service on `127.0.0.1:11435`.
3. Enforce model/path allow-lists, `think:false`, request limits, concurrency 1 initially, a 120-second generation timeout and a shorter embedding timeout.
4. Keep Ollama on `127.0.0.1:11434`; verify firewall rules expose neither 11434 nor 11435 on LAN/WAN.
5. Add health checks for Ollama, both required models, GPU memory and disk space. Logs must not contain prompts, CV text, HR records or credentials.

### 2. Private Cloudflare path

1. Create a named Cloudflare Tunnel owned by the Reid Cloudflare account.
2. Map a dedicated hostname such as `ollama.reidpro.com` to `http://127.0.0.1:11435` through the outbound tunnel only.
3. Protect the hostname with Cloudflare Access service authentication and default-deny every other request.
4. Store the Access client ID/secret only as Supabase Edge Function secrets. Do not commit them, expose them to the browser or paste them into chat.
5. Test denial with no token, a wrong token, disallowed methods/paths, oversized bodies and attempts to call Ollama administration endpoints.

### 3. Reid gateway integration

1. Extend `callOllama` to use the adapter contract and Cloudflare Access headers from secrets.
2. Add provider health, timeout, circuit-breaker and explicit non-sensitive fallback behavior.
3. Update the `ollama` provider endpoint/model values through a migration; enable it only after tunnel tests pass.
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

- A Cloudflare Access service token must be created in the Reid Cloudflare account and stored directly in Supabase secrets.
- Any sudo-required service installation on `ai-lap` must be completed through the user's authenticated terminal; passwords are never requested in chat.
- Confirm whether the proposed `ollama.reidpro.com` hostname is acceptable before creating DNS/Access resources.
