#!/usr/bin/env bash
set -Eeuo pipefail

# MoodPals local clean build helper
# Run from anywhere: bash moodpals-clean-build.sh
# Optional: MOODPALS_PROJECT_DIR=/path/to/SuperDotsPals bash moodpals-clean-build.sh
# WARNING: This clears generated local build caches but does NOT reset git or delete app data.

PROJECT_DIR="${MOODPALS_PROJECT_DIR:-$(pwd)}"
if [[ ! -f "$PROJECT_DIR/package.json" || ! -f "$PROJECT_DIR/app.json" ]]; then
  echo "ERROR: Run from the SuperDotsPals project root, or set MOODPALS_PROJECT_DIR." >&2
  exit 1
fi
cd "$PROJECT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: This local iOS build script requires macOS." >&2
  exit 1
fi
for command in node npm npx xcodebuild pod; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: Missing command: $command" >&2
    exit 1
  fi
done

LOG_DIR="$PROJECT_DIR/build-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/local-clean-build-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
trap 'echo "Build failed at line $LINENO. Review: $LOG_FILE" >&2' ERR

echo "========================================="
echo "MoodPals clean local iOS build"
echo "Project: $PROJECT_DIR"
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "Logs: $LOG_FILE"
echo "========================================="

if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  echo "NOTE: You have uncommitted changes. This script will not reset or overwrite them intentionally."
fi

# Remove only MoodPals Xcode DerivedData; do not erase other projects' build caches.
echo "[1/5] Clearing MoodPals Xcode DerivedData..."
find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 1 -type d -name 'MoodPals-*' -print -exec rm -rf -- {} + 2>/dev/null || true

# npm ci reproduces the lockfile and fails clearly if it is out of sync.
echo "[2/5] Clean installing npm dependencies..."
npm ci --include=dev

echo "[3/5] Checking Expo dependency compatibility..."
npx expo install --check

echo "[4/5] Reinstalling iOS CocoaPods..."
if [[ ! -d ios || ! -f ios/Podfile ]]; then
  echo "ERROR: ios/Podfile is missing. Stop here rather than automatically regenerating watchOS/widget native targets." >&2
  exit 1
fi
(
  cd ios
  pod install --repo-update
)

echo "[5/5] Building MoodPals for an iOS simulator (no upload)..."
npx expo run:ios --no-bundler

echo "SUCCESS: Local iOS build finished. Build log: $LOG_FILE"

# ================================================================
# OPTIONAL CLOUD DEPLOYMENT — intentionally disabled/commented out
# Uncomment and run MANUALLY when ready (not part of local build).
# ================================================================
# npx eas-cli login
# npx eas-cli build --platform ios --profile production --clear-cache
# npx eas-cli submit --platform ios --latest
#
# Or build on Expo AND auto-submit to TestFlight in one command:
 npx eas-cli build --platform ios --profile production --auto-submit --clear-cache
