/**
 * Proof Verification for VCC Prover TS.
 *
 * Verifies UltraHonk proofs against the pinned verifying key using bb.js.
 */
import { VerifyOptions, VerifyResult } from "./types.js";
export declare function verify({ recipe, proofPackage, installDir, vkPath, vkBytes }: VerifyOptions): Promise<VerifyResult>;
