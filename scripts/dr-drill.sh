#!/usr/bin/env bash
set -euo pipefail

echo "=== Atlas DR Drill ==="
echo "Mode: ${1:-dry-run}"

DRY_RUN=${1:-dry-run}
API_URL=${API_URL:-http://localhost:3000}

# Call the DR drill API endpoint
curl -s -X POST "${API_URL}/v1/admin/dr-drill?dryRun=${DRY_RUN}" | jq .

echo "=== DR Drill Complete ==="
