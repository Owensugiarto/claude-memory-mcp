#!/bin/bash
# Weekly git backup — auto-commits and pushes any changes to GitHub
# Runs via PM2 cron every Sunday at 3am PT

cd "C:/dev/claude-memory-mcp" || exit 1

# Check if there are any changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "[backup] No changes to commit"
  exit 0
fi

# Stage everything (except .env, *.db, etc — handled by .gitignore)
git add -A

# Commit with timestamp
TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
git commit -m "backup: weekly auto-backup ${TIMESTAMP}"

# Push
git push origin master
echo "[backup] Pushed to GitHub at ${TIMESTAMP}"
