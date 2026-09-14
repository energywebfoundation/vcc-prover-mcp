/**
 * Toolchain Manager for VCC Prover TS.
 *
 * Integrates NoirJS (`@noir-lang/noir_js`) and Barretenberg (`bb.js`) with BN254 scalar field arithmetic.
 */
export declare const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export declare const ENV: NodeJS.ProcessEnv;
/**
 * Resolves the bb.js executable path.
 */
export declare function getBbJsExecutable(): string;
export declare const BB_JS_BIN: string;
/**
 * Cryptographically uniform random field element using rejection sampling.
 */
export declare function randomFieldElement(): bigint;
export declare function sha256Hex(bytes: Buffer | string): string;
/**
 * Normalised content hash of compiled circuit JSON.
 */
export declare function canonicalCircuitHash(bytes: Buffer | string | object): string | null;
export declare function toolchainVersions(): Promise<{
    noir_js: string;
    bb_js: string;
}>;
/**
 * Initializes the standalone Poseidon2 hasher Noir project from bundled artifact if needed.
 */
export declare function ensureHasherProject(hasherDir: string): void;
/**
 * Computes Poseidon2(value, salt) over BN254 using NoirJS in-memory ACVM execution.
 */
export declare function poseidon2(hasherDir: string, value: bigint | number | string, salt: bigint | number | string, _tag?: string): Promise<{
    ok: true;
    value: string;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Solves circuit constraints and generates witness in-memory via NoirJS,
 * then generates the UltraHonk proof with bb.js.
 */
/**
 * Solves circuit constraints and generates witness in-memory via NoirJS,
 * then generates the UltraHonk proof with bb.js.
 * Supports both on-disk circuit project and in-memory circuit JSON.
 */
export declare function proveCircuitWithNoirJs(circuitDir: string, circuitName: string, inputsMap: Record<string, string>, tag: string, circuitSource?: any): Promise<{
    ok: true;
    proof: Buffer;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Generates UltraHonk proof using NoirJS for witness and bb.js for proving.
 */
export declare function proveCircuit(circuitDir: string, circuitName: string, inputsMap: Record<string, string>, tag: string, circuitSource?: any): Promise<{
    ok: true;
    proof: Buffer;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Verifies an UltraHonk proof using bb.js verify_ultra_honk.
 * Accepts either a path to vk on disk or raw vk buffer in-memory.
 */
export declare function verifyProofWithBbJs(vk: string | Buffer | Uint8Array, proofBytes: Buffer): Promise<{
    ok: boolean;
    valid: boolean;
    detail?: string;
}>;
