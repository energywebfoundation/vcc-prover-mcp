/**
 * Proof Verification for VCC Prover TS.
 *
 * Verifies UltraHonk proofs against the pinned verifying key using bb.js (Wasm).
 */
import fs from "node:fs";
import path from "node:path";
import { checkProofShape } from "./proof-package.js";
import { BB_VERSION, normaliseVersion, sha256Hex, verifyProofWithBbJs } from "./toolchain.js";
export async function verify({ recipe, proofPackage, installDir, vkPath, vkBytes }) {
    const shape = checkProofShape(proofPackage);
    if (!shape.ok) {
        return { ok: false, valid: false, reason: shape.reason };
    }
    // Multi-tier VK resolution: direct buffer -> recipe vk_b64 / vk -> vkPath -> filesystem
    let resolvedVkBuffer = vkBytes ? Buffer.from(vkBytes) : undefined;
    if (!resolvedVkBuffer && recipe?.verification_package?.vk_b64) {
        resolvedVkBuffer = Buffer.from(recipe.verification_package.vk_b64, "base64");
    }
    else if (!resolvedVkBuffer && recipe?.verification_package?.vk) {
        resolvedVkBuffer = Buffer.from(recipe.verification_package.vk, "base64");
    }
    let finalVkTarget;
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
    }
    else {
        const resolvedVkPath = vkPath ||
            (installDir
                ? path.join(installDir, "circuit", "target", "vk")
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
    const pinnedBb = recipe?.verification_package?.pinned?.bb;
    if (pinnedBb && normaliseVersion(pinnedBb) !== BB_VERSION) {
        return {
            ok: false,
            valid: false,
            reason: `This recipe pins bb ${pinnedBb}, and this verifier checks bb ${BB_VERSION} proofs`
        };
    }
    // The proof bytes open with the public inputs, and nothing in them says how many. The
    // recipe's public signal order is the authority; the package's own list is the fallback
    // when verifying without a recipe that states one.
    const order = recipe?.verification_package?.public_signal_order ??
        recipe?.input_schema?.public_signal_order ??
        proofPackage.public_signals_order;
    const claimed = Array.isArray(proofPackage.public_signals)
        ? proofPackage.public_signals
        : undefined;
    const publicInputCount = order?.length ?? claimed?.length;
    if (publicInputCount === undefined) {
        return {
            ok: false,
            valid: false,
            reason: "Cannot tell how many public inputs lead the proof: neither the recipe nor the package lists them"
        };
    }
    const proofBytes = Buffer.from(proofPackage.proof_bytes_b64, "base64");
    const res = await verifyProofWithBbJs(finalVkTarget, proofBytes, publicInputCount);
    // A valid proof only vouches for the public inputs inside its bytes. The package's
    // public_signals are what a reader (and the submission) sees, so they must be those.
    if (res.valid && claimed && res.publicInputs) {
        const mismatch = claimed.length !== res.publicInputs.length ||
            claimed.some((v, i) => {
                try {
                    return BigInt(v) !== BigInt(res.publicInputs[i]);
                }
                catch {
                    return true;
                }
            });
        if (mismatch) {
            return {
                ok: true,
                valid: false,
                detail: "The proof verifies, but its public inputs are not the package's public_signals"
            };
        }
    }
    return {
        ok: res.ok,
        valid: res.valid,
        detail: res.detail
    };
}
