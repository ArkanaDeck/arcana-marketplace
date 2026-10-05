#!/bin/sh
set -eu

REPOSITORY_PATH="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPOSITORY_PATH"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [ "$NODE_MAJOR" != "22" ]; then
	printf '%s\n' 'Installing Node 22 for Xcode Cloud...'
	HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NONINTERACTIVE=1 brew install node@22
	export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

printf '%s\n' 'Installing npm dependencies...'
npm install
printf '%s\n' 'Generating Apple client secret (output suppressed to protect credentials)...'
node ci/generate-apple-secret.js > /dev/null
printf '%s\n' 'Building web assets...'
npm run build
printf '%s\n' 'Syncing Capacitor iOS assets...'
npm run cap:sync:ios
