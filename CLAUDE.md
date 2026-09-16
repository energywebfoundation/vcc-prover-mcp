# Energy Web VCC Prover (Client-Side Zero-Knowledge Prover)

This repository contains the client-side Zero-Knowledge Prover MCP server and CLI toolchain for Energy Web Verified Compute.

## Overview
- Powered by **NoirJS** (ACVM witness generation) and **bb.js** (UltraHonk proof backend) via WebAssembly.
- **Zero Native Dependencies**: Does not require `nargo` or native C++ `bb` binaries; runs portably in Node.js >= 20.
- **Zero Knowledge Privacy Guarantee**: Private input data (e.g. meter readings) and blinding salts remain strictly local and are never leaked to external servers or tool responses.

## Core Rules for AI Agents
1. **Never Disclose Private Values**: Do not echo private activity readings, plaintext volumes, or CSPRNG salts in chat outputs or tool arguments to external services.
2. **Local Artifact Paths & Resolution Precedence**:
   - **Resolution Precedence**: Artifact directories resolve in the following order:
     1. Explicit argument (`saltDir` / `packageDir` in MCP `prove`, or `--salt-dir` / `--package-dir` in CLI).
     2. Environment variables: `VCC_SALT_DIR` and `VCC_PACKAGE_DIR`.
     3. XDG Base Directory convention: `$XDG_DATA_HOME/vcc/private` and `$XDG_DATA_HOME/vcc/packages`.
     4. Default fallback: `~/.vcc/private/<hash>.json` (mode `0600`) and `~/.vcc/packages/<hash>.json`.
   - **Claude Cowork / Connected Remote Directories**:
     - When running inside Claude Cowork (where the agent operates in an isolated sandbox/container connected to a local workspace or remote directory via desktop bridge), default writes to `~/.vcc` remain inside the container's isolated filesystem and won't persist to the user's project folder.
     - **Always direct writes to the connected workspace**: Specify `packageDir` / `saltDir` (or set `VCC_PACKAGE_DIR` / `VCC_SALT_DIR`) pointing to a directory within the connected folder (e.g. `./vcc/packages` and `./vcc/private`).
     - **Never hardcode paths**: Always use the paths returned in `package_written_to` and `private_values_written_to` when inspecting files, performing verification, or streaming payloads.
3. **Verify Before Submission**: Always run `verify` locally to ensure `valid: true` before sending any package to Methodology Graph or verifier endpoints.
4. **Dynamic In-Memory Proving**: Proving supports dynamic circuits via embedded base64 strings (`circuit_b64` and `vk_b64`) or files without requiring local disk compilation.
5. **One Recipe, Nothing To Install**: A recipe from the Methodology Graph's `get_workspace_instructions` is self-contained. It carries the compiled circuit and the verifying key alongside the hashes they must match, so nothing has to be installed first, and `prove` refuses outright if the artifacts it carries do not hash to the pins beside them. Write the recipe to a file and pass `recipe_path`: it runs to tens of kilobytes and pasting it back through a message is what corrupts it.
6. **Do Not Copy Proof Bytes Across Messages (Use Ephemeral Submission Tickets)**:
   UltraHonk proofs are ~19KB of Base64 and contain long stretches of identical repeated characters (e.g. **5,120 consecutive `'A'` characters** from zero-padding in the UltraHonk proof format). Autoregressive LLM decoders cannot reliably emit thousands of identical characters without token counting drift, which mutates the Base64 string and fails the server's `proof_sha256` integrity check.
   - **Always keep `include_proof: false`** (the default) in `prove` and `verify`.
   - **Do NOT copy proof bytes into chat messages or inline tool calls.**
   - Request an ephemeral ticket from Methodology Graph using `request_proof_submission_ticket`.
   - Stream the package JSON file written by `prove` directly from disk (`package_written_to`) to the returned `submit_url` via HTTP POST.
   - This bypasses the LLM context window completely, preserves byte-for-byte SHA256 integrity, and requires no API key to be shared with disk tools.
7. **The Package File Is Ready To Stream As-Is**: `prove` writes the package to disk at `package_written_to` in the complete format expected by the Methodology Graph. When streaming via ticket upload to `submit_url`, post the file directly off disk without modification:
   - `proof_bytes_b64` is accepted natively (no need to rename to `proof`).
   - Nested `formula: { id, version }` is accepted natively (no flattening needed).
   - If `workspace_id` is omitted in the file, it is automatically populated from the ticket.
   - Extra metadata fields (`commitments`, `recipe_cid`, `toolchain`) are safely handled.

---

## Proof Submission Flows (Methodology Graph)

### Primary Flow: Ephemeral Submission Ticket (Recommended & Safe)

This is the standard, production-safe submission method. It decouples proof bulk transport from model token generation.

1. **Generate Proof Locally (MCP or CLI)**:
   Call `prove` with `inputs` and `recipe_path`. Leave `include_proof: false` (default).
   Note the `package_written_to` path (e.g. `~/.vcc/packages/0cfd0bf94446.json`) and `proof_sha256` from the response.

2. **Request Ephemeral Submission Ticket (Methodology Graph MCP)**:
   Call `request_proof_submission_ticket` with:
   ```json
   {
     "workspace_id": "<workspace_id>",
     "formula_id": "<formula_id>",
     "formula_version": "<formula_version>",
     "proof_sha256": "<proof_sha256 recorded by prover>"
   }
   ```
   The Methodology Graph returns:
   - `ticket`: Signed single-use HMAC-SHA256 token (expires in 10 minutes).
   - `submit_url`: Direct upload endpoint (`https://<mcp-host>/mcp/submit-proof?ticket=<ticket>`).
   - `curl_example`: Shell command ready to execute.

3. **Stream Proof Package From Disk via HTTP POST**:
   Execute HTTP POST streaming the file directly from disk:
   ```bash
   curl -s -X POST "$SUBMIT_URL" \
     -H "Content-Type: application/json" \
     --data-binary @"$PACKAGE_PATH"
   ```
   The server authenticates via the ticket, verifies the proof against the pinned verifying key, checks emission factors, records the round in D1, and initiates on-chain voting. It returns HTTP 200 with the round receipt or HTTP 422 if rejected.

---

## Structure of Payload Sent to Methodology Graph

Whether streaming the JSON file from disk to `POST /mcp/submit-proof?ticket=...` or calling the fallback MCP tool `submit_proof_package`, the server accepts the exact JSON structure written by `prove`.

### 1. Complete Package Payload Structure (From `package_written_to`)

This is the complete JSON document that `prove` writes to `~/.vcc/packages/<hash>.json` and that is sent verbatim over HTTP:

```json
{
  "package_format_version": "1",
  "formula": {
    "id": "ghg-scope2",
    "version": "v1"
  },
  "submit_via": {
    "tool": "request_proof_submission_ticket (recommended) or submit_proof_package",
    "workspace_id": "5b93cba1-4635-474e-8309-d14841e6c8a8"
  },
  "recipe_cid": "80dcb3f6ee32df17243774a2eab6213cedf603eaf00af95a5fb1c8301db3a617",
  "public_signals": [
    "0x0000000000000000000000000000000000000000000000000000000000062b18",
    "0x27f54c25eb393963428d0034dd9b8fb03b573a7cb2c0e86b46b2b5126834167e",
    "0x05eb6db7a2dc3f7e53f1883be75e1a3bcfe550302b1156e9c9165bc674ef09dc"
  ],
  "public_signals_named": {
    "emission_factor_encoded": "404248",
    "c_x": "0x27f54c25eb393963428d0034dd9b8fb03b573a7cb2c0e86b46b2b5126834167e",
    "c_y": "0x05eb6db7a2dc3f7e53f1883be75e1a3bcfe550302b1156e9c9165bc674ef09dc"
  },
  "public_signals_order": [
    "emission_factor_encoded",
    "c_x",
    "c_y"
  ],
  "commitments": {
    "c_x": "0x27f54c25eb393963428d0034dd9b8fb03b573a7cb2c0e86b46b2b5126834167e",
    "c_y": "0x05eb6db7a2dc3f7e53f1883be75e1a3bcfe550302b1156e9c9165bc674ef09dc"
  },
  "proof_type": "UltraHonk",
  "proof_bytes_b64": "<base64-encoded UltraHonk proof string, ~19KB>",
  "proof_sha256": "4b68ff0cfd0bf94446b85679fdfa6f959c5d120a1f26cf9c77e7774dc594cfdc",
  "toolchain": {
    "bb": "0.58.0",
    "nargo": "0.36.0",
    "poseidon": "v0.1.0"
  },
  "metadata": {
    "timestamp": "2026-09-15T04:12:00.000Z"
  }
}
```

### 2. Field Specifications & Flexibility Rules

| Field Name | Type | Required? | Description & Mapping Rules |
|---|---|---|---|
| `package_format_version` | `string` | **Required** | Must be `"1"`. Refused if missing or mismatched. |
| `formula` / `formula_id` | `object` or `string` | **Required** | The server accepts either nested `formula: { "id": "...", "version": "..." }` (as written by `prove`) OR top-level `formula_id` and `formula_version`. |
| `workspace_id` | `string` | **Contextual** | **Ticket upload:** Optional in payload; automatically filled and verified from the signed ticket.<br>**Inlined `submit_proof_package`:** Required string. |
| `proof_bytes_b64` / `proof` | `string` | **Required** | The base64-encoded UltraHonk proof bytes (~19KB). Accepted as either `proof_bytes_b64` (prover native) or `proof` (MCP schema name). |
| `public_signals` | `string[]` | **Required** | Array of 0x-prefixed field values in the exact order declared by the verification package. |
| `proof_sha256` | `string` | Optional (Recommended) | 64-character hex SHA-256 of the decoded proof bytes. If provided, server compares it against the received bytes and rejects any altered payload. |
| `toolchain` | `object` | Optional | Provenance object `{ nargo, bb, poseidon }`. Recorded on receipt; not pinned. |
| `commitments` | `object` | Optional | Poseidon2 commitments (`c_x`, `c_y`). Preserved in package. |
| **Private Fields** | - | **STRICTLY FORBIDDEN** | A proof package must carry **no private parameters** (e.g. `electricity_consumed_kwh`, salts `r_x`, `r_y`, quotients, remainders). The server checks against the schema and immediately rejects requests containing private fields. |

---

### Fallback Flow: Direct Inlined Tool Call (`submit_proof_package`)

If shell execution or HTTP streaming is strictly unavailable in your execution environment, you can submit via the inlined MCP tool `submit_proof_package`.

```json
{
  "workspace_id": "string, required — the workspace the proof was built for",
  "package_format_version": "string, required — currently \"1\"",
  "formula_id": "string, required (or formula: { id, version })",
  "formula_version": "string, required (or formula: { id, version })",
  "public_signals": "string[], required — 0x-prefixed field values, in declared order",
  "proof": "string, required — proof bytes base64 (or proof_bytes_b64)",
  "proof_sha256": "string, strongly recommended — checked against bytes; mismatch is refused",
  "toolchain": "object, optional — { nargo, bb, poseidon }"
}
```

**Notes & Defenses for Inlined Submission**:
- **Field Aliases**: The Methodology Graph accepts either `proof` or `proof_bytes_b64`, and accepts either top-level `formula_id`/`formula_version` or a nested `formula: { id, version }`.
- **Repetition Drift Defense**: The Methodology Graph supports Run-Length Encoded (RLE) replacement syntax (e.g. `{5120:A}`) to safely represent the 5,120 zero-padded characters if your model context compresses repeating characters.
- **Handling Hash Mismatches**: If the server returns a `proof_sha256` mismatch, **do not re-prove** (which creates fresh random salts and a completely different proof). Instead, call `verify` with `include_proof: true` or read the JSON file off disk to get a clean, uncorrupted copy.

---

### Response Structure Returned by Methodology Graph

Upon receiving the proof package (via HTTP upload or `submit_proof_package`), the Methodology Graph returns:

#### 1. Success (`HTTP 200` / `status: "ok"`)
```json
{
  "tool": "submit_proof_package",
  "status": "ok",
  "result": {
    "round_id": "9d8a34bc-7123-4567-890a-bcdef0123456",
    "status": "verified",
    "receipt": {
      "round_id": "9d8a34bc-7123-4567-890a-bcdef0123456",
      "formula_id": "ghg-scope2",
      "formula_version": "v1",
      "status": "verified",
      "public_signals": [
        "0x0000000000000000000000000000000000000000000000000000000000062b18",
        "0x27f54c25eb393963428d0034dd9b8fb03b573a7cb2c0e86b46b2b5126834167e",
        "0x05eb6db7a2dc3f7e53f1883be75e1a3bcfe550302b1156e9c9165bc674ef09dc"
      ],
      "factor_encoded": "404248",
      "package_hash": "4b68ff0cfd0bf94446b85679fdfa6f959c5d120a1f26cf9c77e7774dc594cfdc",
      "proof_sha256": "4b68ff0cfd0bf94446b85679fdfa6f959c5d120a1f26cf9c77e7774dc594cfdc",
      "voting_round_id": "4b68ff0cfd0bf94446b85679fdfa6f959c5d120a1f26cf9c77e7774dc594cfdc",
      "voting_start_status": "started",
      "checks": {
        "catalogue": "passed"
      }
    }
  }
}
```

#### 2. Rejection / Emission Factor Mismatch (`HTTP 422` / `status: "rejected"`)
Returned if the proof was computed using an emission factor that does not match the pinned factor in the workspace:
```json
{
  "tool": "submit_proof_package",
  "status": "rejected",
  "result": {
    "round_id": "...",
    "status": "rejected",
    "error": "the proof was made over emission factor 350000, but this workspace pins 404248",
    "catalogue_value": "404248",
    "proved_value": "350000"
  }
}
```

#### 3. Duplicate (`HTTP 409` / `status: "duplicate"`)
Returned if this exact proof package hash has already been submitted:
```json
{
  "tool": "submit_proof_package",
  "status": "duplicate",
  "result": {
    "error": "this proof package has already been submitted",
    "round_id": "...",
    "receipt": { ... }
  }
}
```

---

## MCP Tools
- `status`: Checks NoirJS and bb.js initialization status, versions, and installed artifacts.
- `prove`: Generates an UltraHonk proof package from private activity values, writing public and private packages to disk. `include_proof` defaults to `false` to keep ~19KB of Base64 out of LLM context.
- `verify`: Verifies an UltraHonk proof package locally against a pinned recipe/vk without network access. `include_proof` defaults to `false`.

## CLI Tools
- `node bin/vcc-prove.js --recipe <path> --input "<name>=<value>" [--package-dir <path>] [--salt-dir <path>]`
- `node bin/vcc-verify.js --recipe <path> --package <path>`
- `node bin/vcc-audit.js --private <path> --package <path>`
- `node bin/vcc-prove-mcp.js` (starts stdio MCP server)
