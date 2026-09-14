/**
 * Proof Package Utilities and Validation for VCC Prover TS.
 */

import { ProofPackage } from "./types.js";
import { sha256Hex } from "./toolchain.js";

export const DEFAULT_ENDPOINT = "https://mcp.methodology.energyweb.org";
// The proof package schema version, which is what the Methodology Graph's
// submit_proof_package checks. It was "2025-06-18" here, the MCP protocol date, and
// that is a different thing entirely: every package this prover wrote declared a format
// version the server refuses outright.
export const PACKAGE_FORMAT_VERSION = "1";

export function checkProofShape(pkg: any): { ok: true } | { ok: false; reason: string } {
  if (!pkg || typeof pkg !== "object") {
    return { ok: false, reason: "package must be an object" };
  }
  if (!pkg.formula?.id || !pkg.formula?.version) {
    return { ok: false, reason: "package.formula must carry id and version" };
  }
  if (!pkg.proof_bytes_b64 || typeof pkg.proof_bytes_b64 !== "string") {
    return { ok: false, reason: "package.proof_bytes_b64 must be a non-empty string" };
  }
  if (!pkg.proof_sha256 || typeof pkg.proof_sha256 !== "string") {
    return { ok: false, reason: "package.proof_sha256 must be a string" };
  }
  const decoded = Buffer.from(pkg.proof_bytes_b64, "base64");
  const actualHash = sha256Hex(decoded);
  if (actualHash !== pkg.proof_sha256) {
    return {
      ok: false,
      reason: `proof_sha256 mismatch: declared ${pkg.proof_sha256}, actual ${actualHash}`
    };
  }
  return { ok: true };
}

export function withRedactedProof(pkg: ProofPackage): Record<string, any> {
  const { proof_bytes_b64, ...rest } = pkg;
  return {
    ...rest,
    proof_bytes_b64: `<base64 proof, ${proof_bytes_b64.length} chars, sha256: ${pkg.proof_sha256}>`
  };
}
