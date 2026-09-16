#!/usr/bin/env bash
#
# Downloads Barretenberg's BN254 CRS (Aztec Ignition ceremony output) and
# bundles it into this repo at vendor/bb-crs-home/.bb-crs/, so that bb.js
# never needs to fetch it over the network at prove/verify time (see the
# comment above HAS_BUNDLED_CRS in src/toolchain.ts).
#
# This must be run from a network that can actually reach
# aztec-ignition.s3.amazonaws.com — some corporate/CI networks block it,
# in which case this script will fail with a 403 and you'll need to run it
# from elsewhere (e.g. a personal machine off the corporate network) and
# copy the resulting vendor/bb-crs-home/.bb-crs/*.dat files into the repo.
#
# Usage:
#   ./scripts/fetch-crs.sh [numPoints]
#
# numPoints defaults to 1048576 (2^20), which comfortably covers this
# project's circuits (currently ~8193 points) with headroom for larger ones.
# bb.js only requires the cached file to have *at least* as many points as
# the circuit needs, so a generously-sized cache works for many circuits.

set -euo pipefail

NUM_POINTS="${1:-1048576}"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/vendor/bb-crs-home/.bb-crs"
mkdir -p "$OUT_DIR"

G1_BYTES=$(( NUM_POINTS * 64 - 1 ))

echo "Fetching CRS for ${NUM_POINTS} points into ${OUT_DIR} ..."

curl -fSL -r "0-${G1_BYTES}" -o "${OUT_DIR}/bn254_g1.dat" \
  "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g1.dat"

curl -fSL -o "${OUT_DIR}/bn254_g2.dat" \
  "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g2.dat"

G1_SIZE=$(stat -c%s "${OUT_DIR}/bn254_g1.dat" 2>/dev/null || stat -f%z "${OUT_DIR}/bn254_g1.dat")
G2_SIZE=$(stat -c%s "${OUT_DIR}/bn254_g2.dat" 2>/dev/null || stat -f%z "${OUT_DIR}/bn254_g2.dat")

if [ "$G2_SIZE" -ne 128 ]; then
  echo "ERROR: bn254_g2.dat is ${G2_SIZE} bytes, expected 128. The download" >&2
  echo "likely failed or was intercepted (e.g. a proxy error page). Check" >&2
  echo "the file contents before committing it." >&2
  exit 1
fi

echo "Done. bn254_g1.dat: ${G1_SIZE} bytes, bn254_g2.dat: ${G2_SIZE} bytes."
echo "Commit vendor/bb-crs-home/.bb-crs/*.dat to the repo to bundle the CRS."
