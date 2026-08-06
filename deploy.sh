#!/bin/bash
set -euo pipefail

REPO_NAME="${1:-arkana-website}"
GITHUB_USER="${2:-YOUR_GITHUB_USERNAME}"

printf 'Initializing Git repository...\n'
git init

git add .
git commit -m "Initial Vite React deployment setup"

printf 'Adding GitHub remote...\n'
git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

printf '\nNext steps:\n'
printf '1. Create the repository on GitHub at https://github.com/new\n'
printf '2. Push your code with:\n'
printf '   git push -u origin main\n'
printf '3. Import the repo into Vercel and deploy.\n'
