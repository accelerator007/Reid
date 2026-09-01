# Decisions
1. Vite React preserves the simple Pages deployment; server concerns use Supabase Edge Functions.
2. Supabase is source of truth; Workers are only for a narrow authenticated Ollama gateway if free allowance suffices.
3. Requested model is verified as `gemma4:12b`. `ai-lap`: RTX 3080 Ti 12GB, RAM 32GB, Ryzen 9 5950X.
4. Supabase free requires a separate weekly logical backup.
