#!/usr/bin/env bash
#
# Download the trained ONNX email classifier from the shared GCS bucket.
#
# The model weights (~268 MB) are large and regenerable, so they are NOT in
# git. This bucket is the single source of truth — every environment fetches
# the same artifact instead of passing copies around.
#
# Requires: gcloud auth with access to the wealthmanagement-491511 project
#   (run `gcloud auth login` first if needed).
#
# To regenerate the model from production data, see train.py (--source app).
#
set -euo pipefail

BUCKET="gs://project-atlas-ml-models/onnx"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/model/onnx"

mkdir -p "$DEST"
echo "Downloading model from $BUCKET -> $DEST"
gcloud storage cp "$BUCKET/model.onnx" "$DEST/model.onnx"
gcloud storage cp "$BUCKET/tokenizer.json" "$DEST/tokenizer.json"
gcloud storage cp "$BUCKET/tokenizer_config.json" "$DEST/tokenizer_config.json"
echo "Done. Model ready at $DEST/model.onnx"
