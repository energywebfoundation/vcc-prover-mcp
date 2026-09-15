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
5. **One Recipe, Nothing To Install**: A recipe from the Methodology Graph's `get_workspace_instructions` is self-contained. It carries the compiled circuit and the verifying key alongside the hashes they must match, so nothing has to be installed first, and `prove` refuses outright if the artifacts it carries do not hash to the pins beside them. Write the recipe to a file and pass `recipe_path`: it runs to tens of kilobytes and pasting it back through a message is what corrupts it.
6. **Handle The Proof Carefully**: This prover holds no credential for the Methodology Graph and does not submit. The agent does, by calling `submit_proof_package` with the proof as an argument, so ~19KB of base64 has to cross a message. Ask `prove` for `include_proof`, copy the proof exactly as given, and always send the matching `proof_sha256`: the server checks the two against each other and refuses a mismatch rather than recording a round nobody can verify. To recover from that refusal, call `verify` with `include_proof` for a clean copy off disk. Do not re-prove; the salts are fresh each time, so it produces a different proof rather than the same one again.
7. **The Package Is Ready To Submit**: `prove` writes `package_format_version`, `public_signals` as the ordered 0x array, `formula`, `proof_sha256` and `toolchain` in the shapes `submit_proof_package` declares. Pass them through as they are rather than reassembling them.

## `submit_proof_package` Input Structure (Methodology Graph)

This prover holds no credential for the Methodology Graph and does not call
`submit_proof_package` itself; the agent does, assembling the call from what
`prove` returned. Its declared input schema (`additionalProperties: false`):

```json
{
  "workspace_id": "string, required — the workspace the proof was built for",
  "package_format_version": "string, required — currently \"1\"",
  "formula_id": "string, required",
  "formula_version": "string, required",
  "public_signals": "string[], required — 0x-prefixed field values, in the verification package's declared order",
  "proof": "string, required — the proof bytes, base64 encoded",
  "proof_sha256": "string, optional but strongly recommended — checked against the bytes that arrive; a mismatch is refused rather than recorded",
  "toolchain": "object, optional — { nargo, bb, poseidon }, provenance only, not compared against pinned versions"
}
```

**Field name gotcha, and the recurring mistake it causes:** this prover's own
`ProofPackage` type names the base64 field `proof_bytes_b64`. When assembling
the `submit_proof_package` call, that field must be renamed to `proof` —
sending `proof_bytes_b64` verbatim satisfies nothing on the receiving end and
fails with `{"status":"bad_input","result":{"error":"proof is required"}}`.
`proof_sha256` keeps its name unchanged in both places.

Because `additionalProperties` is `false`, only send the fields above. Other
fields a prove/verify package carries alongside them (`recipe_cid`,
`circuit_hash`, `vk_sha256`, a nested `formula` object) are neither required
nor read by `submit_proof_package`; leave them out of this specific call
rather than passing the whole package through.

## MCP Tools
- `status`: Checks NoirJS and bb.js initialization status and versions.
- `prove`: Generates an UltraHonk proof package from private activity values. `include_proof` returns the proof bytes for the agent that will submit them.
- `verify`: Verifies an UltraHonk proof package locally against a pinned recipe/vk. `include_proof` returns the verified package, proof included, read off disk.

## CLI Tools
- `node bin/vcc-prove.js --recipe <path> --input "<name>=<value>"`
- `node bin/vcc-verify.js --recipe <path> --package <path>`
- `node bin/vcc-audit.js --private <path> --package <path>`
- `node bin/vcc-prove-mcp.js` (starts stdio MCP server)
