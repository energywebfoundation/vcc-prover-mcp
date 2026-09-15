# Energy Web VCC Prover MCP

Client-side Zero-Knowledge Prover MCP server and CLI toolchain for Energy Web Verified Compute.

Powered by **NoirJS** and **bb.js** (WebAssembly). Runs completely on your local machine with **zero native C++ or nargo toolchain installations**.

---

## Features
- **Zero-Knowledge Privacy**: Private activity meter readings and CSPRNG blinding salts never leave your machine.
- **UltraHonk Proof Backend**: State-of-the-art ZK proving via `@aztec/bb.js`.
- **Pure Node.js**: Portable across macOS, Linux, and Windows (Node.js >= 20).
- **Claude Desktop & Cowork Ready**: Includes `.mcpb` manifest and stdio MCP server for immediate agent integration.

---

## Installation & Setup

### Option 1: Claude Desktop 1-Click Extension (.mcpb)
1. Download the latest `vcc-prover.mcpb` from [GitHub Releases](https://github.com/energywebfoundation/vcc-prover-mcp/releases).
2. Double-click the `.mcpb` file to install it directly into Claude Desktop.
3. Open Claude Desktop and start using the `status`, `prove`, and `verify` tools.

### Option 2: Add Manually to Claude Desktop Config
Add the server definition to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vcc-prover": {
      "command": "node",
      "args": [
        "/path/to/vcc-prover-mcp/bin/vcc-prove-mcp.js"
      ]
    }
  }
}
```

### Option 3: Use with Cowork / AI Coding Agents / CLI
Clone the repository and install runtime dependencies:
```bash
git clone https://github.com/energywebfoundation/vcc-prover-mcp.git
cd vcc-prover-mcp
npm install --omit=dev
```

Run CLI tools directly:
```bash
# Check prover status
node bin/vcc-prove.js --help

# Generate a zero-knowledge proof
node bin/vcc-prove.js --recipe examples/recipe.json --input "Electricity consumed=1500.734"

# Verify a proof package locally
node bin/vcc-verify.js --recipe examples/recipe.json --package ~/.vcc/packages/<hash>.json
```

---

## MCP Tools Reference

| Tool | Parameters | Description |
|---|---|---|
| `status` | None | Reports NoirJS and bb.js Wasm engine status and versions. |
| `prove` | `recipe_path`, `inputs`, `circuit_b64`, `vk_b64` | Computes Poseidon2 commitments and generates an UltraHonk proof without disclosing private readings. |
| `verify` | `recipe_path`, `proof_package`, `vk_b64` | Verifies the UltraHonk proof binary against the circuit verification key locally. |

---

## Cryptographic Guarantees
- **Private Data Isolation**: Proof generation draws cryptographic blinding salts and computes commitments $C_X$ and $C_Y$ locally over BN254. Plaintext inputs and salts are written to `~/.vcc/private/<hash>.json` with restricted file permissions (`0600`).
- **Verifiable Computation**: Anyone with the public proof package can verify that the calculation adhered to the pinned formula without seeing the underlying activity volume.

---

## License
MIT License.
