/**
 * Core type definitions for VCC Prover TS.
 */
export interface DomainCheck {
    min?: string | number | bigint;
    max?: string | number | bigint;
    max_decimal?: string;
}
export interface SchemaParam {
    name: string;
    position?: number;
    kind: "private_input" | "public_input" | "coefficient" | "salt" | "derived_witness" | "commitment" | string;
    visibility: "private" | "public";
    meaning?: string;
    decimals?: number;
    domain?: DomainCheck;
    derivation?: string;
    primitive?: string;
    commits_to?: string;
    commitment_of?: string;
    salt?: string;
    salt_param?: string;
}
export interface SchemaDerivation {
    id: string;
    primitive: string;
    primitive_version?: string;
    operands: string[];
    divisor?: number | string | bigint;
    rounding?: "half_up" | string;
    produces?: Record<string, string>;
    yields?: string;
}
export interface RecipePrecision {
    decimals: number;
    encode?: string;
    on_inexact?: string;
    on_out_of_domain?: string;
    provisional?: boolean;
}
export interface RecipeRounding {
    rescale?: string;
    applied?: string;
    note?: string;
}
export interface InputSchema {
    schema_version?: string;
    formula_id: string;
    formula_version: string;
    entry?: string;
    field?: string;
    precision: RecipePrecision;
    rounding?: RecipeRounding;
    commitment?: {
        primitive: string;
        arity: number;
        form: string;
        granularity: string;
    };
    public_signal_order: string[];
    derivations?: SchemaDerivation[];
    params: SchemaParam[];
}
export interface VerificationPackageMetadata {
    circuit_hash?: string;
    vk_sha256?: string;
    public_signal_order: string[];
    commitment_rule?: any;
    encoding_rule?: any;
    pinned?: {
        nargo?: string;
        bb?: string;
        poseidon?: string;
    };
    /**
     * In-memory compiled Noir circuit object (ideal for DB storage / API delivery).
     */
    circuit_json?: any;
    /**
     * Base64-encoded compiled Noir circuit JSON bytecode.
     */
    circuit_b64?: string;
    /**
     * Base64-encoded UltraHonk verifying key (1,825 bytes raw).
     */
    vk_b64?: string;
    /**
     * Alias for vk_b64.
     */
    vk?: string;
}
export interface SubmitVia {
    tool?: string;
    workspace_id?: string;
    /**
     * Where a package is posted. Stated so a prover configured with its own API key can
     * post one itself; no credential is ever carried alongside it.
     */
    endpoint?: string;
}
export interface Recipe {
    workspace?: {
        id: string;
        name?: string;
        status?: string;
    };
    recipe_cid?: string;
    formula: {
        id: string;
        version: string;
    };
    verification_package?: VerificationPackageMetadata;
    input_schema: InputSchema;
    /**
     * The coefficient frozen when the workspace was deployed, already encoded. Used as
     * given: re-deriving it from value_decimal is where a prover and the server's
     * catalogue check drift apart by one unit in the last place.
     */
    factor?: {
        name?: string;
        value_encoded: string;
        value_decimal?: string | null;
        set_id?: string | null;
        key?: string | null;
        unit?: string | null;
        decimals?: number;
    };
    factors?: Record<string, string>;
    ruleset?: any;
    /** The package schema version the issuing server speaks. */
    package_format_version?: string;
    submit_via?: SubmitVia;
    next?: any[];
    submission_endpoint?: string;
}
export interface EncodedValueResult {
    ok: true;
    value: bigint;
}
export interface EncodedValueError {
    ok: false;
    reason: string;
}
export type EncodeResult = EncodedValueResult | EncodedValueError;
export interface RescaleAndRoundOptions {
    operands: (bigint | number | string)[];
    divisor: bigint | number | string;
    rounding: string;
}
export interface RescaleAndRoundResult {
    raw: bigint;
    quotient: bigint;
    remainder: bigint;
    bump: bigint;
    output: bigint;
}
export interface ProofPackage {
    /** The package schema version submit_proof_package checks. Currently "1". */
    package_format_version?: string;
    /** Legacy. Carried the MCP protocol date, which is not a package format version. */
    format_version?: string;
    formula: {
        id: string;
        version: string;
    };
    submit_via?: SubmitVia | null;
    recipe_cid?: string;
    /** The ordered, 0x-prefixed field values, as submit_proof_package declares them. */
    public_signals: string[];
    /** The same signals keyed by name, for a human reading the package off disk. */
    public_signals_named?: Record<string, string>;
    public_signals_order: string[];
    toolchain?: {
        nargo?: string;
        bb?: string;
        poseidon?: string;
    };
    commitments: Record<string, string>;
    proof_type: "UltraHonk" | string;
    proof_bytes_b64: string;
    proof_sha256: string;
    metadata?: {
        noir_js_version?: string;
        bb_version?: string;
        timestamp?: string;
    };
}
export interface PrivateAuditPack {
    formula: {
        id: string;
        version: string;
    };
    tag: string;
    created_at: string;
    inputs_raw: Record<string, string | number>;
    inputs_encoded: Record<string, string>;
    salts: Record<string, string>;
    commitments: Record<string, string>;
    derived_witnesses: Record<string, string>;
    plaintext_output: {
        encoded: string;
        decimal: string;
    };
}
export interface ProveOptions {
    recipe: Recipe;
    inputs: Record<string, string | number>;
    installDir?: string;
    circuitDir?: string;
    /**
     * In-memory compiled Noir circuit object (bypasses filesystem read).
     */
    circuitJson?: any;
    /**
     * Raw Buffer/Uint8Array of circuit JSON (bypasses filesystem read).
     */
    circuitBytes?: Buffer | Uint8Array;
    saltDir?: string;
    packageDir?: string;
    tag?: string;
    customSalts?: Record<string, bigint | string>;
}
export interface ProveResultSuccess {
    ok: true;
    package: ProofPackage;
    package_written_to?: string;
    private_values_written_to?: string;
    summary: {
        formula: string;
        proof_sha256: string;
        public_signals: Record<string, string>;
    };
}
export interface ProveResultError {
    ok: false;
    reason: string;
}
export type ProveResult = ProveResultSuccess | ProveResultError;
export interface VerifyOptions {
    recipe: Recipe;
    proofPackage: ProofPackage;
    installDir?: string;
    vkPath?: string;
    /**
     * Raw Buffer/Uint8Array of the verifying key (bypasses filesystem read).
     */
    vkBytes?: Buffer | Uint8Array;
}
export interface VerifyResult {
    ok: boolean;
    valid: boolean;
    reason?: string;
    detail?: string;
}
export interface AuditResult {
    ok: boolean;
    valid: boolean;
    reason?: string;
    checks?: {
        c_x_match?: boolean;
        c_y_match?: boolean;
        [key: string]: boolean | undefined;
    };
}
