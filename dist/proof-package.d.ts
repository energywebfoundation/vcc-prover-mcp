/**
 * Proof Package Utilities and Validation for VCC Prover TS.
 */
import { ProofPackage } from "./types.js";
export declare const DEFAULT_ENDPOINT = "https://mcp.methodology.energyweb.org";
export declare const PACKAGE_FORMAT_VERSION = "1";
export declare function checkProofShape(pkg: any): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function withRedactedProof(pkg: ProofPackage): Record<string, any>;
