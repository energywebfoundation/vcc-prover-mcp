# Release & Distribution Guide

This document outlines how to release **`@energyweb/vcc-prover-mcp`** to the [npm registry](https://www.npmjs.com/package/@energyweb/vcc-prover-mcp) and how end users consume the published package.

---

## 1. Package Summary

- **Package Name**: `@energyweb/vcc-prover-mcp`
- **Scope**: `@energyweb`
- **Access**: Public (`--access public`)
- **Main Entrypoint**: `dist/index.js`
- **CLI Binaries**:
  - `vcc-prove-mcp` — stdio MCP server for Claude Desktop / AI Agents
  - `vcc-prove` — Client-side zero-knowledge UltraHonk proof generator
  - `vcc-verify` — Local proof verifier
  - `vcc-audit` — Commitment & constraint auditor

---

## 2. Prerequisites

1. **npm Account**: An account on [npmjs.com](https://www.npmjs.com) with publishing permissions under the `@energyweb` organization.
2. **Authentication**:
   - For local release: Logged in via `npm login`.
   - For GitHub Actions: An npm Automation Access Token added as repository secret `NPM_TOKEN`.

---

## 3. Releasing to npm

### Method A: Automated Release via GitHub Actions (Recommended)

When configured with `.github/workflows/release.yml`, pushing a version tag triggers an automated build, test, and publish pipeline.

1. **Ensure your branch is clean and up to date**:
   ```bash
   git checkout master
   git pull origin master
   ```

2. **Bump version and generate git tag**:
   ```bash
   # For bug fixes / patches:
   npm version patch -m "chore(release): %s"

   # For new features:
   npm version minor -m "chore(release): %s"

   # For breaking changes:
   npm version major -m "chore(release): %s"
   ```

3. **Push commit and tag to GitHub**:
   ```bash
   git push origin master --follow-tags
   ```

4. **Workflow Execution**:
   - GitHub Actions will detect the `v*` tag.
   - It will install dependencies, verify files, and publish to npm with provenance.

---

### Method B: Manual Release via CLI

1. **Verify authentication**:
   ```bash
   npm whoami
   ```

2. **Preview files to be packed**:
   ```bash
   npm pack --dry-run
   ```
   Inspect the file list to verify that only `dist/`, `bin/`, `artifacts/`, `manifest.json`, and documentation are included.

3. **Bump version**:
   ```bash
   npm version patch -m "chore(release): %s"
   ```

4. **Publish to npm registry**:
   Since the package is scoped under `@energyweb`, specify `--access public`:
   ```bash
   npm publish --access public
   ```

5. **Push git tags**:
   ```bash
   git push origin master --follow-tags
   ```

---

## 4. GitHub Actions Workflow Configuration

To enable automated releases, save the following workflow to `.github/workflows/release.yml`:

```yaml
name: Release to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # Required for npm provenance
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Publish to npm
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 5. End-User Usage After Release

Once published, users can consume `@energyweb/vcc-prover-mcp` across several environments without cloning the repository.

### A. Claude Desktop & AI Coding Agents (Zero-Install via `npx`)

Add the prover MCP server directly to `claude_desktop_config.json`:

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

### B. Global CLI Installation

Users who prefer system-wide CLI access can install globally:

```bash
npm install -g @energyweb/vcc-prover-mcp
```

Commands available globally:
```bash
# Verify toolchain status
vcc-prove --status

# Generate ZK proof
vcc-prove --recipe recipe.json --input "Electricity consumed=1500.734"

# Verify proof package
vcc-verify --recipe recipe.json --package ~/.vcc/packages/<hash>.json

# Audit package
vcc-audit --package ~/.vcc/packages/<hash>.json

# Run MCP server
vcc-prove-mcp
```

### C. One-Off CLI Execution via `npx`

Run without installing:

```bash
npx -p @energyweb/vcc-prover-mcp vcc-prove --recipe recipe.json --input "Electricity consumed=1500.734"
```

### D. Programmatic TypeScript / Node.js SDK

Developers can install the package into their backend services:

```bash
npm install @energyweb/vcc-prover-mcp
```

```typescript
import { prove, verify, audit, initToolchain } from "@energyweb/vcc-prover-mcp";

// Initialize Wasm toolchain
await initToolchain();

// Generate proof
const proofPackage = await prove({
  recipePath: "./recipe.json",
  inputs: { "Electricity consumed": 1500.734 }
});

// Verify proof
const result = await verify({
  recipePath: "./recipe.json",
  proofPackage
});
console.log("Verification valid:", result.valid);
```

---

## 6. Post-Release Verification

After publishing, verify the package on npm:

```bash
# Check published version info
npm view @energyweb/vcc-prover-mcp

# Test execution with npx
npx -p @energyweb/vcc-prover-mcp vcc-prove --help
```
