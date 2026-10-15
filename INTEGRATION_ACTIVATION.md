# Integration activation

Reviewed 2026-10-14. These are remaining operator actions, not completed activations.

## Meetings

The host already has Google app credentials. The inspected service configuration has no Recall key and no transcription readiness flag. Google consent state must be checked for the intended Owner.

1. In the existing company Google OAuth application, verify the authorized callback is `https://reidpro.com/api/meet/google/callback`. The Owner connects Google through Connections → Google Meet. No password is collected by Reid.
2. Configure the company's Recall account and matching region. Store its key privately as `RECALL_API_KEY` in the existing service environment. Configure the Recall region endpoint when needed; do not send the key in chat, PRs or source.
3. Connect the existing ElevenLabs account in that Recall region and verify live transcription there before setting `RECALL_TRANSCRIPTION_READY=1`. This flag is an operator assertion, not an independent test of spoken audio.
4. Restart the API only through the normal release procedure. Run **Check meeting connections**. It refreshes Google authorization, checks Recall access and local AI/TTS, and reports the declared transcription configuration. It creates no meeting or outbound WhatsApp message.
5. A real meeting still needs an explicit Owner start and spoken end-to-end test. Connectivity alone does not prove joining, hearing, speaking and leaving work together.

## Physical ai-lap adapter

The current Production SSH key permits port forwarding only. It cannot install files. Use an existing shell-capable login on the physical laptop; do not broaden the forwarding key.

Build an explicit-source-only archive:

```bash
bash scripts/package-ai-lap.sh /tmp/reid-ai-lap-update.tar.gz
```

Copy it through the operator's authorized channel, extract into a temporary directory, and run `bash install-update.sh` as the existing ai-lap service user. The installer requires the existing private adapter environment, runs the Python tests, backs up the adapter, replaces it, restarts the user service and checks health/version. Failed verification restores the adapter. It does not replace credentials or restart the old laptop worker against the retired Supabase project.

The current worker runs on the Reid host via the migrated Compose runner profile. Changes to runner credentials or project targets require separate verification; the bundle intentionally does not activate that historical laptop worker.

## Local reply evaluation

Run `server/evaluate-replies.mjs` where the existing private `AI_URL`/`AI_TOKEN` are available. `REID_EVAL_OUTPUT` optionally writes a JSON result. The four synthetic cases cover Omani intake, a grounded document answer, absent document data and refusing to invent an action receipt. No customer conversation or outgoing message is involved. The checks are a limited regression sample, not a claim of general accuracy.

## External model fallback

No automatic external fallback is enabled. Configure a real provider through the Owner model center, store its key in Vault, pass its connection test, and verify its data clearance before assigning permitted workloads. Internal, CRM and HR data remain local under the existing policy.
