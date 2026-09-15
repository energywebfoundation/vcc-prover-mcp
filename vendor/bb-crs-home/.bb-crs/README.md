# Bundled Barretenberg CRS

This directory is where the BN254 CRS (Aztec Ignition ceremony output) lives
once fetched, so `bb.js` never needs network access at prove/verify time.

Run from a network that can reach `aztec-ignition.s3.amazonaws.com`:

    ./scripts/fetch-crs.sh

That downloads `bn254_g1.dat` and `bn254_g2.dat` into this folder. Once they
are present, `src/toolchain.ts` automatically points the `bb.js` subprocess
here instead of `~/.bb-crs`, and `npm test` / proving / verifying work fully
offline.

If this folder is empty, `bb.js` falls back to its normal behavior: it
downloads the CRS to `~/.bb-crs` on first use, which requires that
`aztec-ignition.s3.amazonaws.com` be reachable.
