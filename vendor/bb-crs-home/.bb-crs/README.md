# Bundled Barretenberg CRS

This directory is where the BN254 CRS (Aztec Ignition ceremony output) lives
once fetched, so `bb.js` never needs network access at prove/verify time.

Run from a network that can reach `aztec-ignition.s3.amazonaws.com`:

    ./scripts/fetch-crs.sh

That downloads `bn254_g1.dat` and `bn254_g2.dat` into this folder. Once they
are present, `src/toolchain.ts` passes this folder to bb.js as its `crsPath`,
and `npm test` / proving / verifying work fully offline. Only the BN254 SRS is
loaded; the Grumpkin SRS bb.js would otherwise also fetch is not used by
UltraHonk proofs.

If this folder is empty, bb.js falls back to its own default: it downloads the
CRS to `$CRS_PATH` or `~/.bb-crs` on first use, which requires that
`crs.aztec-cdn.foundation` be reachable.
