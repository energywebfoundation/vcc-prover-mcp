# Energy Web VCC Prover (Client-Side Zero-Knowledge Prover)

This repository contains the client-side Zero-Knowledge Prover MCP server and CLI toolchain for Energy Web Verified Compute.

## Overview
- Powered by **NoirJS** (ACVM witness generation) and **bb.js** (UltraHonk proof backend) via WebAssembly.
- **Zero Native Dependencies**: Does not require `nargo` or native C++ `bb` binaries; runs portably in Node.js >= 20.
- **Zero Knowledge Privacy Guarantee**: Private input data (e.g. meter readings) and blinding salts remain strictly local and are never leaked to external servers or tool responses.

## Core Rules for AI Agents
1. **Never Disclose Private Values**: Do not echo private activity readings, plaintext volumes, or CSPRNG salts in chat outputs or tool arguments to external services.
2. **Local Artifact Paths**:
   - Proof packages (public commitments + UltraHonk proof binary) are written to `~/.vcc/packages/<hash>.json`.
   - Private disclosure packs (plaintext + blinding salts) are written with `0600` permissions to `~/.vcc/private/<hash>.json`.
3. **Verify Before Submission**: Always run `verify` locally to ensure `valid: true` before sending any package to Methodology Graph or verifier endpoints.
4. **Dynamic In-Memory Proving**: Proving supports dynamic circuits via embedded base64 strings (`circuit_b64` and `vk_b64`) or files without requiring local disk compilation.

## MCP Tools
- `status`: Checks NoirJS and bb.js initialization status and versions.
- `prove`: Generates an UltraHonk proof package from private activity values.
- `verify`: Verifies an UltraHonk proof package locally against a pinned recipe/vk.

## CLI Tools
- `node bin/vcc-prove.js --recipe <path> --input "<name>=<value>"`
- `node bin/vcc-verify.js --recipe <path> --package <path>`
- `node bin/vcc-audit.js --private <path> --package <path>`
- `node bin/vcc-prove-mcp.js` (starts stdio MCP server)
