#!/bin/sh
# Xcode Cloud: regenerate the gitignored Capacitor files (public/, capacitor.config.json, config.xml).
set -e

brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build
npx cap sync ios
