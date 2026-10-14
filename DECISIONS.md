# Current architectural decisions

1. Production web/API run on the Reid Ubuntu host behind Cloudflare Tunnel. Supabase remains the authoritative Auth/database/Storage system; old Pages/Worker assumptions are historical.
2. Local ai-lap is the last verified enabled model provider. External provider activation is explicit and subject to testing and data clearance; outages never silently export company content.
3. Provider definitions are data in `llm_providers`. Fixed models can be chosen, or `auto` resolved during an explicit provider test; normal requests use that concrete tested resolution.
4. Provider keys stay in Vault and host runtime secrets stay outside the repository. Browser users never read a secret or Vault identifier.
5. Chat diagnostics store aggregate latency/token/failure data, not prompts. Governed agent runs keep their established audit boundaries; conversation ledgers remain separately access-controlled.
6. Client follow-up creation is one PostgreSQL transaction authorized by the real Owner session, with conversation locking for retry safety. Employee task access does not imply WhatsApp access.
7. Public-table encrypted backup/restore is a tested recovery layer, not a substitute for full managed Auth/Storage recovery.
8. Integration configuration, connectivity verification and a successful real user flow are separate states. Meetings and physical laptop installation must report their remaining prerequisites truthfully.

Historical decisions remain in [the archive](docs/history/DECISIONS.md). Current release state is in [AGENTS.md](AGENTS.md).
