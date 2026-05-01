#!/usr/bin/env bash
# Promotes a build manifest from staging to production
set -euo pipefail

MANIFEST_FILE="${1:?Usage: promote-manifest.sh <manifest.json>}"

# Verify manifest exists and is valid JSON
if ! jq . "$MANIFEST_FILE" > /dev/null 2>&1; then
  echo "Invalid manifest"
  exit 1
fi

VERSION=$(jq -r '.version' "$MANIFEST_FILE")
CHECKSUM=$(sha256sum "$MANIFEST_FILE" | cut -d' ' -f1)

echo "Promoting version $VERSION (checksum: $CHECKSUM)"

# Ensure target directory exists
mkdir -p "manifests/production"

cp "$MANIFEST_FILE" "manifests/production/${VERSION}.json"
echo '{"promoted":true,"version":"'"$VERSION"'","checksum":"'"$CHECKSUM"'","promotedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' > "manifests/production/${VERSION}.meta.json"

echo "Done. Manifest promoted to production."
