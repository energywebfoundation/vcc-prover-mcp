# Energy Web VCC Prover (`@energyweb/vcc-prover-mcp`) — Comprehensive Usage Guide

Comprehensive usage manual for **`@energyweb/vcc-prover-mcp`**, the client-side Zero-Knowledge UltraHonk prover, verifier, and audit toolchain for Energy Web Verified Compute (VCC).

---

## 1. Package Overview & Architecture

`@energyweb/vcc-prover-mcp` provides a fully client-side Zero-Knowledge proof toolchain designed for privacy-preserving verified compute in energy workflows (such as GHG Scope 2 emissions and renewable certificates).

### Key Architectural Highlights
- **Zero-Knowledge Privacy**: Private activity meter readings (e.g., electricity consumption in kWh) and cryptographically secure pseudorandom number generator (CSPRNG) blinding salts never leave your local environment.
- **Wasm-Powered Noir & UltraHonk**: Uses **NoirJS** (`@noir-lang/noir_js`) for ACVM witness generation and **bb.js** (`@aztec/bb.js`) for UltraHonk SNARK proof construction and verification over the BN254 elliptic curve.
- **Zero Native Dependencies**: Completely runs inside Node.js (>= 20). No native C++ compilation, `nargo`, or Barretenberg CLI binaries required.
- **Multi-Modal Interface**: Available as:
  1. **Model Context Protocol (MCP) Server** via stdio for AI assistants (Antigravity, Claude Desktop, Cursor, Claude Code).
  2. **CLI Executables** (`vcc-prove`, `vcc-verify`, `vcc-audit`, `vcc-prove-mcp`).
  3. **Node.js / TypeScript SDK** for programmatic backend services.
- **Self-Contained Recipes**: Integrates with Energy Web Methodology Graph. The recipe carries the compiled circuit and verifying key alongside pinned factor hashes, verifying integrity before running.

---

## 2. Installation

### Option A: Global Installation (Recommended for CLI)
To use the CLI binaries globally from any terminal:
```bash
npm install -g @energyweb/vcc-prover-mcp
```
Verify the installation:
```bash
vcc-prove --help
vcc-verify --help
vcc-audit --help
```

### Option B: Local Project Dependency (For Node.js / TypeScript Apps)
Install inside your project:
```bash
npm install @energyweb/vcc-prover-mcp
```

### Option C: Zero-Install via `npx` (Recommended)
Run all CLI tools and MCP server directly with zero cloning or installation:
```bash
# Generate a zero-knowledge proof:
npx -y -p @energyweb/vcc-prover-mcp vcc-prove --recipe recipe.json --input "Electricity consumed=1500.734"

# Verify a proof package locally:
npx -y -p @energyweb/vcc-prover-mcp vcc-verify --recipe recipe.json --package ~/.vcc/packages/<hash>.json

# Audit private disclosures against public commitments:
npx -y -p @energyweb/vcc-prover-mcp vcc-audit --private ~/.vcc/private/<hash>.json --package ~/.vcc/packages/<hash>.json

# Start the stdio MCP server:
npx -y -p @energyweb/vcc-prover-mcp vcc-prove-mcp
```

### Option D: Claude Desktop 1-Click Extension (`.mcpb`)
Download the compiled `vcc-prover.mcpb` bundle from [GitHub Releases](https://github.com/energywebfoundation/vcc-prover-mcp/releases) and double-click to install into Claude Desktop.

---

## 3. Configuring the MCP Server in AI Assistants

The MCP server runs over `stdio` via the `vcc-prove-mcp` binary. It provides AI agents with tools to check toolchain readiness, generate zero-knowledge proofs, and verify proofs locally.

### A. Google Antigravity / Gemini IDE
Add to `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "vcc-prover": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@energyweb/vcc-prover-mcp",
        "vcc-prove-mcp"
      ]
    }
  }
}
```

*Or, if you have cloned the repository locally:*
```json
{
  "mcpServers": {
    "vcc-prover": {
      "command": "node",
      "args": [
        "/absolute/path/to/vcc-prover-mcp/bin/vcc-prove-mcp.js"
      ]
    }
  }
}
```

### B. Claude Desktop
Add to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vcc-prover": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@energyweb/vcc-prover-mcp",
        "vcc-prove-mcp"
      ]
    }
  }
}
```

### C. Cursor / Claude Code / Cline
In your agent settings or `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "vcc-prover": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@energyweb/vcc-prover-mcp",
        "vcc-prove-mcp"
      ]
    }
  }
}
```
*(Or use `"command": "vcc-prove-mcp"` if installed globally via `npm install -g @energyweb/vcc-prover-mcp`)*

---

## 4. MCP Tools Reference

The MCP server registers 3 tools:

### 1. `status`
Inspects whether the local Wasm toolchain (NoirJS and bb.js) is initialized and reports installed artifact status.
- **Inputs**: None (`{}`)
- **Returns**: JSON containing:
  ```json
  {
    "toolchain": {
      "noir_js": "0.36.0 (NoirJS)",
      "bb_js": "0.58.0 (bb.js)",
      "poseidon": "v0.1.0"
    },
    "bb_js_executable": "@aztec/bb.js",
    "ready": true,
    "installed_artifacts": {
      "install_dir": "/Users/<user>/.vcc/install",
      "vk_present": false
    }
  }
  ```

### 2. `prove`
Executes Noir witness generation, draws CSPRNG salts, computes Poseidon2 commitments ($C_X, C_Y$), and produces an UltraHonk proof.
- **Inputs**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `inputs` | `object` | Yes | Key-value pairs of private activity values (decimal strings, e.g. `{"Electricity consumed": "1500.734"}`). |
  | `recipe` | `object` | Conditional | Recipe JSON object returned from `get_workspace_instructions`. |
  | `recipe_path` | `string` | Conditional | File path to `recipe.json` on disk (recommended for large recipes). |
  | `include_proof` | `boolean` | Optional | Default: `false`. When `false`, returns metadata and disk path while redacting ~19KB proof bytes to prevent LLM context corruption. |
- **Returns**:
  ```json
  {
    "status": "PROVED",
    "package_written_to": "/Users/<user>/.vcc/packages/c476b9aafbd3.json",
    "private_values_written_to": "/Users/<user>/.vcc/private/c476b9aafbd3.json",
    "summary": {
      "recipe_cid": "80dcb3f6ee32df17243774a2eab6213cedf603eaf00af95a5fb1c8301db3a617",
      "formula": { "id": "ghg-scope2", "version": "v1" },
      "proof_sha256": "674ee5d3ed188729f31ef177bad95ad555bdb2147eb2e686348f3838d62e9695"
    },
    "package": { ... }
  }
  ```

### 3. `verify`
Verifies an UltraHonk proof package against a recipe and verification key offline without network calls.
- **Inputs**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `recipe` / `recipe_path` | `object` / `string` | Yes | The recipe object or file path. |
  | `package` / `package_path` | `object` / `string` | Yes | The proof package object or file path. |
  | `include_proof` | `boolean` | Optional | Default: `false`. Set to `true` if you need the verified proof package returned in the tool response. |
- **Returns**:
  ```json
  {
    "valid": true,
    "reason": "Proof is cryptographically valid"
  }
  ```

---

## 5. Command-Line Interface (CLI) Usage

The package provides four CLI tools.

### A. `vcc-prove` — Generate Proof
Generates the UltraHonk proof, computes commitments, and saves public and private packages.

```bash
# Zero-install via npx:
npx -y -p @energyweb/vcc-prover-mcp vcc-prove \
  --recipe /path/to/recipe.json \
  --input "Electricity consumed=1500.734" \
  [--package-dir ./packages] \
  [--salt-dir ./private]

# Or if installed globally:
vcc-prove \
  --recipe /path/to/recipe.json \
  --input "Electricity consumed=1500.734"
```

#### Supported CLI Options:
- `--recipe <file|->`: Path to `recipe.json` or `-` to read from stdin (Required).
- `--input "<name>=<value>"`: Input parameter and decimal value. Can be repeated multiple times.
- `--package-dir <path>`: Directory to output public proof packages (defaults to layered resolver).
- `--salt-dir <path>`: Directory to output private disclosures and salts (defaults to layered resolver).
- `--install <path>`: Directory for cached toolchain and artifacts.

#### Example Output:
```json
{
  "package_format_version": "1",
  "formula": {
    "id": "ghg-scope2",
    "version": "v1"
  },
  "public_signals": [
    "0x0000000000000000000000000000000000000000000000000000000000062b18",
    "0x27f54c25eb393963428d0034dd9b8fb03b573a7cb2c0e86b46b2b5126834167e",
    "0x05eb6db7a2dc3f7e53f1883be75e1a3bcfe550302b1156e9c9165bc674ef09dc"
  ],
  "proof_sha256": "674ee5d3ed188729f31ef177bad95ad555bdb2147eb2e686348f3838d62e9695",
  "private_values_written_to": "/Users/<user>/.vcc/private/c476b9aafbd3.json",
  "package_written_to": "/Users/<user>/.vcc/packages/c476b9aafbd3.json"
}
```

---

### B. `vcc-verify` — Verify Proof Offline
Checks the UltraHonk proof against the pinned verification key in `recipe.json`.

```bash
# Zero-install via npx:
npx -y -p @energyweb/vcc-prover-mcp vcc-verify \
  --recipe /path/to/recipe.json \
  --package /path/to/proof_package.json

# Or if installed globally:
vcc-verify \
  --recipe /path/to/recipe.json \
  --package /path/to/proof_package.json
```

#### Exit Codes & Output:
- **Success (`exit 0`)**:
  ```text
  vcc-verify: verification SUCCESSFUL (UltraHonk proof valid)
  ```
- **Failure (`exit 1`)**:
  ```text
  vcc-verify: verification FAILED: <reason>
  ```

---

### C. `vcc-audit` — Authenticate Commitments
Verifies that the private values and salts in a private disclosure file match the Poseidon2 commitments ($C_X, C_Y$) inside the public package.

```bash
# Zero-install via npx:
npx -y -p @energyweb/vcc-prover-mcp vcc-audit \
  --private ~/.vcc/private/c476b9aafbd3.json \
  --package ~/.vcc/packages/c476b9aafbd3.json

# Or if installed globally:
vcc-audit \
  --private ~/.vcc/private/c476b9aafbd3.json \
  --package ~/.vcc/packages/c476b9aafbd3.json
```

#### Output:
```text
vcc-audit: audit SUCCESSFUL! All Poseidon2 commitments verified against private disclosures.
```

---

### D. `vcc-prove-mcp` — Run MCP Server
Starts the stdio JSON-RPC server:
```bash
# Zero-install via npx:
npx -y -p @energyweb/vcc-prover-mcp vcc-prove-mcp

# Or if installed globally:
vcc-prove-mcp
```

---

## 6. Programmatic TypeScript / Node.js SDK

You can import `@energyweb/vcc-prover-mcp` into any Node.js (>=20) application or backend service.

```typescript
import fs from "node:fs";
import { prove, verify, auditDisclosure, initToolchain } from "@energyweb/vcc-prover-mcp";

async function main() {
  // 1. Optional: Warm up the Wasm toolchain
  await initToolchain();

  // 2. Load the recipe fetched from Energy Web Methodology Graph
  const recipe = JSON.parse(fs.readFileSync("./recipe.json", "utf-8"));

  // 3. Generate the Zero-Knowledge Proof
  const proveResult = await prove({
    recipe,
    inputs: {
      "Electricity consumed": "1500.734"
    },
    // Optional custom storage paths:
    packageDir: "./output/packages",
    saltDir: "./output/private"
  });

  if (!proveResult.ok) {
    console.error("Proving failed:", proveResult.reason);
    return;
  }

  console.log("Proof generated successfully!");
  console.log("SHA-256:", proveResult.summary.proof_sha256);
  console.log("Package file:", proveResult.package_written_to);
  console.log("Private file:", proveResult.private_values_written_to);

  // 4. Verify locally
  const verifyResult = await verify({
    recipe,
    proofPackage: proveResult.package
  });

  console.log("Verification valid:", verifyResult.valid); // true

  // 5. Audit commitments against private values
  const privateData = JSON.parse(fs.readFileSync(proveResult.private_values_written_to, "utf-8"));
  const auditResult = await auditDisclosure(privateData, proveResult.package);
  console.log("Commitments audit passed:", auditResult.valid); // true
}

main().catch(console.error);
```

---

## 7. End-to-End Workflow with Energy Web Methodology Graph

The primary workflow pairs `@energyweb/vcc-prover-mcp` with an Energy Web Methodology Graph workspace.

```
┌─────────────────────────────────┐
│  Energy Web Methodology Graph   │
└──────────────┬──────────────────┘
               │ 1. get_workspace_instructions
               ▼
┌─────────────────────────────────┐
│           recipe.json           │
└──────────────┬──────────────────┘
               │ 2. vcc-prove --recipe recipe.json --input "Electricity=..."
               ▼
┌─────────────────────────────────┐
│      ~/.vcc/packages/*.json     │ (Public Proof Package)
│      ~/.vcc/private/*.json      │ (Private Salts & Readings, mode 0600)
└──────────────┬──────────────────┘
               │ 3. vcc-verify (Local Verification)
               ▼
┌─────────────────────────────────┐
│ 4. request_proof_submission_    │
│    ticket (Methodology Graph)   │
└──────────────┬──────────────────┘
               │ Returns: ticket & submit_url
               ▼
┌─────────────────────────────────┐
│ 5. Direct HTTP POST Stream:     │ (Bypasses LLM token window)
│    curl -X POST "$SUBMIT_URL"   │
│      --data-binary @"$PKG"      │
└─────────────────────────────────┘
```

### Step 1: Fetch Workspace Instructions (Recipe)
```bash
curl -s -X POST https://mcp.methodology.energyweb.org/mcp/tools/get_workspace_instructions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"<workspace_id>"}' > recipe.json
```
*Note: Always use `get_workspace_instructions` (which embeds the compiled circuit and verifying key), not `get_workspace`.*

### Step 2: Generate Proof Locally
```bash
# Zero-install via npx (recommended):
npx -y -p @energyweb/vcc-prover-mcp vcc-prove --recipe recipe.json --input "Electricity consumed=1500.734"

# Or if installed globally:
vcc-prove --recipe recipe.json --input "Electricity consumed=1500.734"
```
Note the resulting:
- `package_written_to` (e.g. `~/.vcc/packages/c476b9aafbd3.json`)
- `proof_sha256` (e.g. `674ee5d3ed188729f31ef177bad95ad555bdb2147eb2e686348f3838d62e9695`)

### Step 3: Local Verification
Always verify locally before submitting:
```bash
# Zero-install via npx (recommended):
npx -y -p @energyweb/vcc-prover-mcp vcc-verify --recipe recipe.json --package ~/.vcc/packages/c476b9aafbd3.json

# Or if installed globally:
vcc-verify --recipe recipe.json --package ~/.vcc/packages/c476b9aafbd3.json
```

### Step 4: Request Ephemeral Submission Ticket
Ask Methodology Graph for a short-lived HMAC-signed submission ticket (valid for 10 minutes):
```bash
curl -s -X POST https://mcp.methodology.energyweb.org/mcp/tools/request_proof_submission_ticket \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "<workspace_id>",
    "formula_id": "ghg-scope2",
    "formula_version": "v1",
    "proof_sha256": "674ee5d3ed188729f31ef177bad95ad555bdb2147eb2e686348f3838d62e9695"
  }'
```
Response provides:
```json
{
  "ticket": "9d8a34bc...",
  "submit_url": "https://mcp.methodology.energyweb.org/mcp/submit-proof?ticket=9d8a34bc..."
}
```

### Step 5: Stream the Proof Package Directly From Disk
Stream the file unmodified directly to `submit_url`:
```bash
curl -s -X POST "$SUBMIT_URL" \
  -H "Content-Type: application/json" \
  --data-binary @"~/.vcc/packages/c476b9aafbd3.json"
```

> **Why Ephemeral Tickets Instead of Pasting Proofs?**
> UltraHonk proofs are ~19KB of Base64 and contain over 5,120 consecutive zero-padding `'A'` characters. LLM decoders frequently experience token drift when echoing long repetitive strings, corrupting the Base64 bytes. Streaming directly from disk preserves byte-level SHA256 integrity and keeps API tokens out of filesystem tools.

---

## 8. Directory Resolution & Environment Variables

Artifacts and private values are stored using a 4-tier resolution precedence:

1. **Explicit Argument**: `--package-dir` / `--salt-dir` (CLI) or `packageDir` / `saltDir` (API / MCP).
2. **Environment Variables**:
   - `VCC_PACKAGE_DIR`: Directory where public proof packages are stored.
   - `VCC_SALT_DIR`: Directory where private disclosures and CSPRNG salts are stored.
   - `VCC_INSTALL_DIR`: Toolchain and target artifact cache directory.
3. **XDG Base Directory Convention**:
   - `$XDG_DATA_HOME/vcc/packages`
   - `$XDG_DATA_HOME/vcc/private`
4. **Default User Home Fallback**:
   - `~/.vcc/packages/<hash>.json` (Public package)
   - `~/.vcc/private/<hash>.json` (Private values, secured with `0600` permissions)

### Working in Claude Cowork / Remote Sandboxes
In containerized agent environments (like Claude Cowork), default writes to `~/.vcc` stay inside the container's temporary filesystem. To persist files to your mounted project folder, set:
```bash
export VCC_PACKAGE_DIR="./vcc/packages"
export VCC_SALT_DIR="./vcc/private"
```

---

## 9. Offline & Air-Gapped Operation (CRS Setup)

`bb.js` fetches Barretenberg's BN254 Common Reference String (CRS) from `aztec-ignition.s3.amazonaws.com` upon first run, saving to `~/.bb-crs/`.

If your corporate firewall, air-gapped server, or locked-down CI restricts external S3 downloads, pre-seed the CRS files:
```bash
# Inside the repository clone:
npm run crs:fetch
```
This vendors the CRS points into `vendor/bb-crs-home/.bb-crs/`. Once present, `bb.js` reads from this directory automatically with zero network calls.

---

## 10. Security & Privacy Rules

1. **Never Disclose Private Values**: Do not echo private meter readings or CSPRNG salts in chat context or external tool arguments.
2. **Keep `include_proof: false`**: Default to `include_proof: false` in MCP calls. Use the on-disk file path for uploading proofs.
3. **Always Verify Before Submission**: Run `vcc-verify` locally before requesting a ticket or submitting to the network.
4. **Do Not Re-Prove on Network Errors**: UltraHonk draws fresh random salts on every invocation, producing a completely different proof with a new SHA-256 hash. If submission fails due to transport corruption, re-read the existing file from disk or call `verify` with `include_proof: true` rather than re-proving.

---

## 11. Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| `Recipe file not found` | Relative path error | Use an absolute path or verify current working directory. |
| `Verification FAILED: Proof is invalid` | Altered package or mismatched recipe | Ensure the exact `recipe.json` used for proving is passed to `vcc-verify`. |
| `the proof was made over emission factor X, but this workspace pins Y` | Stale recipe or factor | Re-fetch the workspace recipe via `get_workspace_instructions`. |
| `Proof SHA256 mismatch on submission` | Proof altered across chat/token boundary | Do not copy Base64 proof strings into chat. Use the ticket streaming upload (`--data-binary @"<path>"`). |
| `Fetch error downloading CRS` | Network blocking AWS S3 | Run `npm run crs:fetch` on an unblocked machine or vendor CRS to `~/.bb-crs/`. |

---

## 12. License

MIT License — Energy Web Foundation.
