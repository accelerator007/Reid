#!/usr/bin/env bash
# نشر موقع رِيْد على Cloudflare Pages
# الاستخدام: ./deploy.sh [اسم-مشروع-Pages]   (الافتراضي: reid)
# يبني نسخة نظيفة في dist/ ويستثني الوثائق الداخلية من النشر.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="${1:-reid}"

rm -rf dist
mkdir -p dist
rsync -a \
  --exclude '.git' \
  --exclude '.gitignore' \
  --exclude '.claude' \
  --exclude 'dist' \
  --exclude 'node_modules' \
  --exclude 'deploy.sh' \
  --exclude 'README.md' \
  --exclude 'IMPROVEMENT-PLAN.md' \
  --exclude 'BUSINESS-PLAN.md' \
  --exclude '.DS_Store' \
  ./ dist/

echo "== dist/ جاهز ($(find dist -type f | wc -l | tr -d ' ') ملفًا) =="
npx wrangler pages deploy dist --project-name "$PROJECT" --commit-dirty=true
