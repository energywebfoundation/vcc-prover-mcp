/**
 * Proof Verification for VCC Prover TS. updated
 *
 * Verifies UltraHonk proofs against the pinned verifying key using bb.js.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkProofShape } from "./proof-package.js";
import { sha256Hex, verifyProofWithBbJs } from "./toolchain.js";
import { VerifyOptions, VerifyResult } from "./types.js";

export async function verify({
  recipe,
  proofPackage,
  installDir,
  vkPath,
  vkBytes
}: VerifyOptions): Promise<VerifyResult> {
  const shape = checkProofShape(proofPackage);
  if (!shape.ok) {
    return { ok: false, valid: false, reason: shape.reason };
  }

  // Multi-tier VK resolution: direct buffer -> recipe vk_b64 / vk -> vkPath -> filesystem
  let resolvedVkBuffer: Buffer | undefined = vkBytes ? Buffer.from(vkBytes) : undefined;
  if (!resolvedVkBuffer && recipe?.verification_package?.vk_b64) {
    resolvedVkBuffer = Buffer.from(recipe.verification_package.vk_b64, "base64");
  } else if (!resolvedVkBuffer && recipe?.verification_package?.vk) {
    resolvedVkBuffer = Buffer.from(recipe.verification_package.vk, "base64");
  }

  let finalVkTarget: string | Buffer;

  if (resolvedVkBuffer) {
    // Validate cryptographic integrity of in-memory VK against recipe pin
    if (recipe?.verification_package?.vk_sha256) {
      const actualHash = sha256Hex(resolvedVkBuffer);
      if (actualHash !== recipe.verification_package.vk_sha256) {
        return {
          ok: false,
          valid: false,
          reason: `Verifying key hash mismatch: expected ${recipe.verification_package.vk_sha256}, got ${actualHash}`
        };
      }
    }
    finalVkTarget = resolvedVkBuffer;
  } else {
    const resolvedVkPath =
      vkPath ||
      (installDir
        ? path.join(
          installDir,
          "circuit",
          "target",
          "vk"
        )
        : undefined);

    if (!resolvedVkPath || !fs.existsSync(resolvedVkPath)) {
      return {
        ok: false,
        valid: false,
        reason: `Verifying key not found at ${resolvedVkPath || "local install"}. Ensure formula is installed or provide vk_b64 in recipe.`
      };
    }

    finalVkTarget = resolvedVkPath;
  }

  const proofBytes = Buffer.from(proofPackage.proof_bytes_b64, "base64");
  const res = await verifyProofWithBbJs(finalVkTarget, proofBytes);

  return {
    ok: res.ok,
    valid: res.valid,
    detail: res.detail
  };
}
