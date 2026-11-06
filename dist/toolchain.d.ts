/**
 * Toolchain Manager for VCC Prover TS.
 *
 * Integrates NoirJS (`@noir-lang/noir_js`) and Barretenberg (`bb.js`) with BN254 scalar field arithmetic.
 */
export declare const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export declare const BB_VERSION = "6.0.0";
export declare const NOIR_VERSION = "1.0.0";
/** A version string without the leading "v" some bb releases print ("v6.0.0" -> "6.0.0"). */
export declare function normaliseVersion(v: string): string;
export declare const HAS_BUNDLED_CRS: boolean;
export declare const CRS_DIR: string | undefined;
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
    prover: string | undefined;
}>;
/**
 * Initializes the standalone Poseidon2 hasher Noir project from bundled artifact if needed.
 */
export declare function ensureHasherProject(hasherDir?: string): void;
/**
 * Computes Poseidon2(value, salt) over BN254 using NoirJS in-memory ACVM execution.
 */
export declare function poseidon2(hasherDir: string | undefined, value: bigint | number | string, salt: bigint | number | string, _tag?: string): Promise<{
    ok: true;
    value: string;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Solves the circuit's witness in memory with NoirJS, then proves it with bb.js
 * (UltraHonk, Wasm backend). Takes the circuit either as compiled JSON in hand
 * (`circuitSource`) or from `<circuitDir>/target/<circuitName>.json`.
 *
 * The proof bytes returned are the circuit's public inputs followed by the proof
 * (bb.js reconstructHonkProof). bb 6 hands the two back separately and its verifier
 * takes them separately; the package carries them as one string so that its sha256,
 * which the Methodology Graph uses as the voting round id, covers the public inputs
 * (the emission factor among them) as well as the proof. Nothing in the bytes states
 * how many public inputs lead, so verifying splits them again with that count from
 * the recipe.
 */
export declare function proveCircuitWithNoirJs(circuitDir: string | undefined, circuitName: string | undefined, inputsMap: Record<string, string>, _tag: string, circuitSource?: any): Promise<{
    ok: true;
    proof: Buffer;
    publicInputs: string[];
} | {
    ok: false;
    reason: string;
}>;
/**
 * Generates UltraHonk proof using NoirJS for witness and bb.js for proving.
 */
export declare function proveCircuit(circuitDir: string | undefined, circuitName: string | undefined, inputsMap: Record<string, string>, tag: string, circuitSource?: any): Promise<{
    ok: true;
    proof: Buffer;
    publicInputs: string[];
} | {
    ok: false;
    reason: string;
}>;
/**
 * Verifies an UltraHonk proof package's bytes (public inputs followed by the proof)
 * against a verifying key, with bb.js on the Wasm backend.
 *
 * `publicInputCount` is how many 32-byte fields lead the bytes; the caller takes it
 * from the recipe's public signal order. `vk` is a path to the key on disk or its bytes.
 * Returns the public inputs read out of the bytes alongside the verdict so the caller
 * can compare them with what the package claims.
 */
export declare function verifyProofWithBbJs(vk: string | Buffer | Uint8Array, proofBytes: Buffer, publicInputCount: number): Promise<{
    ok: boolean;
    valid: boolean;
    detail?: string;
    publicInputs?: string[];
}>;
