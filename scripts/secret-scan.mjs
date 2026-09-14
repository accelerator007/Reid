#!/usr/bin/env node
// Dependency-free secret scan over tracked files. A third-party scanner action
// would add a supply-chain dependency to the one job whose whole purpose is to
// protect credentials, so the rules live here where they can be reviewed.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const rules = [
  { id: 'supabase_service_role_jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { id: 'private_key_block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'aws_access_key_id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'slack_token', pattern: /\bxox[abpsr]-[0-9A-Za-z-]{10,}/ },
  { id: 'github_token', pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { id: 'openai_key', pattern: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { id: 'assigned_secret', pattern: /(?:SERVICE_ROLE_KEY|SESSION_KEY|ORIGIN_TOKEN|BRIDGE_TOKEN|APP_SECRET|ACCESS_TOKEN|API_KEY)\s*[:=]\s*['"][A-Za-z0-9_\-/+]{16,}['"]/ },
];

const binary = /\.(png|jpe?g|gif|webp|ico|pdf|ttf|otf|woff2?|zip|gz|mp4|wasm)$/i;
const allowlisted = /^(?:\.env\.example|.*\.example|scripts\/secret-scan\.mjs)$/;

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const file of files) {
  if (binary.test(file) || allowlisted.test(file)) continue;
  let stats;
  try { stats = statSync(file); } catch { continue; }
  if (!stats.isFile() || stats.size > 2_000_000) continue;
  const text = readFileSync(file, 'utf8');
  for (const rule of rules) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split('\n').length;
    findings.push(`${file}:${line} — ${rule.id}`);
  }
}

if (findings.length) {
  console.error(`secret scan failed (${findings.length}):\n${findings.map(item => `  ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`secret scan clean across ${files.length} tracked files`);
