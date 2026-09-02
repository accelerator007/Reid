# Deployment
Cloudflare Pages `reid` is connected to `accelerator007/Reid` and `reidpro.com`. Build: `npm ci && npm run build`; output: `dist`; Node 22. Production branch `main`; previews `develop` and `feature/*`. Require CI + Cloudflare checks; only Owner merges to production.

Supabase ref `pkogchbrknwmzefjklkr`, Mumbai. Link with `supabase link --project-ref pkogchbrknwmzefjklkr`, review diff, then `supabase db push`. Never pass passwords on the command line.
