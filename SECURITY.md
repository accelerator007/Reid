# Security
RLS is deny-by-default. Secrets stay in provider stores. Use signed file URLs, hashed single-use approval tokens, rate limits and Turnstile. Lock UI after 20 inactive minutes. Audit privileged actions. MFA is required before enabling L4.

`has_role` is intentionally `SECURITY DEFINER` and executable only by `authenticated`; this avoids recursive RLS on `user_roles`. Its fixed empty search path and fully-qualified objects reduce function-hijacking risk. Audit triggers are not directly executable by API roles.
