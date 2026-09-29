#!/bin/sh
set -eu

REPOSITORY_PATH="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$REPOSITORY_PATH"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [ "$NODE_MAJOR" != "22" ]; then
	brew install node@22
	export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

npm ci
npm run build
npm run cap:sync:ios
