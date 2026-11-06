/**
 * Toolchain Manager for VCC Prover TS.
 *
 * Integrates NoirJS (`@noir-lang/noir_js`) and Barretenberg (`bb.js`) with BN254 scalar field arithmetic.
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Noir } from "@noir-lang/noir_js";
import {
  BackendType,
  Barretenberg,
  Crs,
  UltraHonkBackend,
  UltraHonkVerifierBackend,
  deflattenFields,
  reconstructHonkProof,
  splitHonkProof
} from "@aztec-foundation/bb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// BN254 scalar field modulus
export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// The proving backend this build drives, and the one a recipe must pin for a proof from
// here to verify against its key. The registry pins bb by version, and bb's proof format
// and transcript changed between 0.58.0 and 6.0.0, so a 0.58.0 key cannot check a proof
// from this backend or the other way round.
export const BB_VERSION = "6.0.0";
export const NOIR_VERSION = "1.0.0";

/** A version string without the leading "v" some bb releases print ("v6.0.0" -> "6.0.0"). */
export function normaliseVersion(v: string): string {
  return String(v).trim().replace(/^v/, "");
}

// The verifier target every proof from here is made and checked for: Poseidon2 transcript,
// zero-knowledge, no IPA accumulation. It is bb's own default (`bb prove` with no -t), and
// the default the Methodology Graph's verifier uses, so the three agree on the transcript.
const VERIFIER_TARGET = "noir-recursive" as const;

// Barretenberg CRS (structured reference string).
//
// bb.js loads the BN254 CRS (Aztec Ignition ceremony output) from a cache directory and
// downloads it from crs.aztec-cdn.foundation when the cache is short. That host is not
// reachable from every environment (corporate proxies, sandboxed CI, offline machines),
// so this package can carry the CRS itself under vendor/bb-crs-home/.bb-crs/ and point
// bb.js at it through its crsPath option. Without the bundled files, bb.js's own default
// applies: $CRS_PATH, else ~/.bb-crs, downloading on first use.
//
// Only the BN254 SRS is loaded. bb.js's own initialisation also loads a Grumpkin SRS,
// which is for the Chonk/IPA flows and no part of an UltraHonk proof, and which would be
// a second download every fresh machine has to make; loading the SRS here instead of
// through Barretenberg.new keeps it out.
const REPO_CRS_DIR = path.join(__dirname, "..", "vendor", "bb-crs-home", ".bb-crs");
const REPO_CRS_G1 = path.join(REPO_CRS_DIR, "bn254_g1.dat");
const REPO_CRS_G2 = path.join(REPO_CRS_DIR, "bn254_g2.dat");
export const HAS_BUNDLED_CRS = fs.existsSync(REPO_CRS_G1) && fs.existsSync(REPO_CRS_G2);
export const CRS_DIR: string | undefined = HAS_BUNDLED_CRS ? REPO_CRS_DIR : undefined;

// Points loaded per backend: bb.js's own default (2^19), which covers any circuit up to
// that size and is well under the 2^20 points bundled. VCC_SRS_SIZE raises it for a larger
// circuit.
const SRS_POINTS = Number(process.env.VCC_SRS_SIZE) > 0 ? Number(process.env.VCC_SRS_SIZE) : 2 ** 19;

/**
 * A Barretenberg instance on the Wasm backend with the BN254 SRS loaded.
 *
 * Wasm, not bb.js's default of its bundled native binary: the native backend runs a
 * separate bb process that does its own CRS handling and ignores crsPath, and this
 * package's promise is that proving runs inside Node.js on any platform it does.
 * The caller destroys it.
 */
async function newBarretenberg(): Promise<Barretenberg> {
  const api = await Barretenberg.new({
    backend: BackendType.Wasm,
    skipSrsInit: true,
    crsPath: CRS_DIR
  });
  try {
    const crs = await Crs.new(SRS_POINTS, CRS_DIR);
    const loaded = await api.srsInitSrs({
      pointsBuf: crs.getG1Data(),
      numPoints: crs.numPoints,
      g2Point: crs.getG2Data()
    });
    // A compressed download comes back decompressed; caching it saves the next run the
    // work. The bundled CRS is already uncompressed, so this never writes into the package.
    if (loaded.pointsBuf.length > 0) await crs.cacheUncompressed(loaded.pointsBuf);
    return api;
  } catch (err) {
    await api.destroy().catch(() => {});
    throw err;
  }
}

/** A 0x-prefixed hex field element as its 32 big-endian bytes. */
function fieldHexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").padStart(64, "0");
  if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`public input ${hex} is not a 32-byte field element`);
  }
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

/**
 * Cryptographically uniform random field element using rejection sampling.
 */
export function randomFieldElement(): bigint {
  for (;;) {
    const candidate = BigInt(`0x${randomBytes(32).toString("hex")}`);
    if (candidate < FIELD_MODULUS) return candidate;
  }
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Normalised content hash of compiled circuit JSON.
 */
export function canonicalCircuitHash(bytes: Buffer | string | object): string | null {
  const sort = (v: any): any =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])])
        )
      : v;
  try {
    const parsed =
      typeof bytes === "object" && !Buffer.isBuffer(bytes)
        ? bytes
        : JSON.parse(Buffer.from(bytes as Buffer | string).toString("utf-8"));
    return sha256Hex(JSON.stringify(sort(parsed)));
  } catch {
    return null;
  }
}

// Own package identity (name@version), read once from package.json so the proof
// package's toolchain provenance records which build of this prover produced it.
let cachedProverVersion: string | undefined;
function proverVersion(): string | undefined {
  if (cachedProverVersion !== undefined) return cachedProverVersion;
  try {
    const pkgJsonPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    cachedProverVersion = pkg.name && pkg.version ? `${pkg.name}@${pkg.version}` : pkg.version;
  } catch {
    cachedProverVersion = undefined;
  }
  return cachedProverVersion;
}

export async function toolchainVersions(): Promise<{
  noir_js: string;
  bb_js: string;
  prover: string | undefined;
}> {
  const bb_js = `${BB_VERSION} (bb.js)`;
  const noir_js = `${NOIR_VERSION} (NoirJS)`;
  const prover = proverVersion();
  return { noir_js, bb_js, prover };
}

/**
 * Initializes the standalone Poseidon2 hasher Noir project from bundled artifact if needed.
 */
export function ensureHasherProject(hasherDir?: string): void {
  if (!hasherDir) return;
  const targetJson = path.join(hasherDir, "target", "hasher.json");
  // Copy the bundled hasher in when there is none, and also when the one there was
  // compiled by a Noir this build's NoirJS cannot run. An install made by an earlier
  // release keeps that release's hasher (Noir 0.36), and NoirJS 1.0 refuses to
  // deserialise it, so without the version check every prove after an upgrade fails.
  if (fs.existsSync(targetJson) && hasherCompiledByCurrentNoir(targetJson)) return;
  const possibleBundled = [
    path.join(__dirname, "..", "artifacts", "hasher.json"),
    path.join(__dirname, "artifacts", "hasher.json"),
    path.join(process.cwd(), "artifacts", "hasher.json")
  ];
  for (const src of possibleBundled) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(hasherDir, "target"), { recursive: true });
      fs.copyFileSync(src, targetJson);
      circuitCache.delete(targetJson);
      break;
    }
  }
}

/** Whether a compiled Noir artifact's noir_version is the Noir this build runs. */
function hasherCompiledByCurrentNoir(artifactPath: string): boolean {
  try {
    const v = JSON.parse(fs.readFileSync(artifactPath, "utf8")).noir_version;
    return typeof v === "string" && v.split("+")[0] === NOIR_VERSION;
  } catch {
    return false;
  }
}

// In-memory cache for loaded Noir circuit instances
const circuitCache = new Map<string, any>();

function getCachedCircuit(circuitJsonPath: string): any {
  if (!circuitCache.has(circuitJsonPath)) {
    const content = JSON.parse(fs.readFileSync(circuitJsonPath, "utf8"));
    circuitCache.set(circuitJsonPath, content);
  }
  return circuitCache.get(circuitJsonPath);
}

/**
 * Computes Poseidon2(value, salt) over BN254 using NoirJS in-memory ACVM execution.
 */
export async function poseidon2(
  hasherDir: string | undefined,
  value: bigint | number | string,
  salt: bigint | number | string,
  _tag: string = "h"
): Promise<{ ok: true; value: string } | { ok: false; reason: string }> {
  let hasherJsonPath = "";
  if (hasherDir) {
    try {
      ensureHasherProject(hasherDir);
    } catch {
      // An install dir this process cannot write to; the bundled hasher below serves.
    }
    hasherJsonPath = path.join(hasherDir, "target", "hasher.json");
  }
  if (!hasherJsonPath || !fs.existsSync(hasherJsonPath) || !hasherCompiledByCurrentNoir(hasherJsonPath)) {
    const possibleBundled = [
      path.join(__dirname, "..", "artifacts", "hasher.json"),
      path.join(__dirname, "artifacts", "hasher.json"),
      path.join(process.cwd(), "artifacts", "hasher.json")
    ];
    for (const src of possibleBundled) {
      if (fs.existsSync(src)) {
        hasherJsonPath = src;
        break;
      }
    }
  }

  if (!hasherJsonPath || !fs.existsSync(hasherJsonPath)) {
    return { ok: false, reason: `Hasher circuit artifact not found at ${hasherJsonPath}` };
  }

  try {
    const hasherCircuit = getCachedCircuit(hasherJsonPath);
    const noir = new Noir(hasherCircuit);

    let hashHex = "";
    const foreignCallHandler = async (name: string, inputs: any[]) => {
      if (name === "print" && inputs[1] && inputs[1][0]) {
        hashHex = inputs[1][0];
      }
      return [];
    };

    await noir.execute(
      { val: value.toString(), salt: salt.toString() },
      foreignCallHandler
    );

    if (hashHex) {
      const valInt = BigInt(hashHex);
      return { ok: true, value: `0x${valInt.toString(16).padStart(64, "0")}` };
    }
    return { ok: false, reason: "NoirJS hasher completed without emitting print oracle output" };
  } catch (err: any) {
    return { ok: false, reason: `NoirJS Poseidon2 execution failed: ${err.message}` };
  }
}

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
export async function proveCircuitWithNoirJs(
  circuitDir: string | undefined,
  circuitName: string = "",
  inputsMap: Record<string, string>,
  _tag: string,
  circuitSource?: any
): Promise<{ ok: true; proof: Buffer; publicInputs: string[] } | { ok: false; reason: string }> {
  let circuit: any = circuitSource;
  if (typeof circuit === "string") {
    try {
      circuit = JSON.parse(circuit);
    } catch {
      return { ok: false, reason: "circuit source is not valid JSON" };
    }
  }
  if (!circuit) {
    if (!circuitDir) {
      return { ok: false, reason: "circuitDir is required when circuitSource is not provided" };
    }
    const circuitJsonPath = path.join(circuitDir, "target", `${circuitName}.json`);
    try {
      circuit = getCachedCircuit(circuitJsonPath);
    } catch (e: any) {
      return { ok: false, reason: `Failed to read compiled circuit at ${circuitJsonPath}: ${e.message}` };
    }
  }

  // 1. Solve the witness with NoirJS. It stays in memory: nothing private is written
  //    to disk on the way to the proof.
  let witness: Uint8Array;
  try {
    const noir = new Noir(circuit);
    ({ witness } = await noir.execute(inputsMap));
  } catch (noirErr: any) {
    return { ok: false, reason: `NoirJS witness generation failed:\n${noirErr.message}` };
  }

  // 2. Prove with bb.js.
  let api: Barretenberg | undefined;
  try {
    api = await newBarretenberg();
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    const { proof, publicInputs } = await backend.generateProof(witness, {
      verifierTarget: VERIFIER_TARGET
    });
    const inputBytes = new Uint8Array(publicInputs.length * 32);
    publicInputs.forEach((pi, i) => inputBytes.set(fieldHexToBytes(pi), i * 32));
    return {
      ok: true,
      proof: Buffer.from(reconstructHonkProof(inputBytes, proof)),
      publicInputs: publicInputs.map((pi) => `0x${pi.replace(/^0x/, "").padStart(64, "0")}`)
    };
  } catch (bbErr: any) {
    return { ok: false, reason: `bb.js UltraHonk proving failed:\n${bbErr?.message ?? String(bbErr)}` };
  } finally {
    await api?.destroy().catch(() => {});
  }
}

/**
 * Generates UltraHonk proof using NoirJS for witness and bb.js for proving.
 */
export async function proveCircuit(
  circuitDir: string | undefined,
  circuitName: string = "",
  inputsMap: Record<string, string>,
  tag: string,
  circuitSource?: any
): Promise<{ ok: true; proof: Buffer; publicInputs: string[] } | { ok: false; reason: string }> {
  return proveCircuitWithNoirJs(circuitDir, circuitName, inputsMap, tag, circuitSource);
}

/**
 * Verifies an UltraHonk proof package's bytes (public inputs followed by the proof)
 * against a verifying key, with bb.js on the Wasm backend.
 *
 * `publicInputCount` is how many 32-byte fields lead the bytes; the caller takes it
 * from the recipe's public signal order. `vk` is a path to the key on disk or its bytes.
 * Returns the public inputs read out of the bytes alongside the verdict so the caller
 * can compare them with what the package claims.
 */
export async function verifyProofWithBbJs(
  vk: string | Buffer | Uint8Array,
  proofBytes: Buffer,
  publicInputCount: number
): Promise<{ ok: boolean; valid: boolean; detail?: string; publicInputs?: string[] }> {
  if (!Number.isInteger(publicInputCount) || publicInputCount < 0) {
    return { ok: false, valid: false, detail: `invalid public input count ${publicInputCount}` };
  }
  if (proofBytes.length % 32 !== 0 || proofBytes.length <= publicInputCount * 32) {
    return {
      ok: true,
      valid: false,
      detail:
        `proof is ${proofBytes.length} bytes, which is not ${publicInputCount} public inputs ` +
        `followed by a proof in 32-byte fields`
    };
  }

  let vkBytes: Uint8Array;
  try {
    vkBytes = typeof vk === "string" ? fs.readFileSync(vk) : Uint8Array.from(vk);
  } catch (err: any) {
    return { ok: false, valid: false, detail: `could not read verifying key: ${err.message}` };
  }

  const { publicInputs, proof } = splitHonkProof(Uint8Array.from(proofBytes), publicInputCount);
  const publicInputsHex = deflattenFields(publicInputs).map(
    (pi) => `0x${pi.replace(/^0x/, "").padStart(64, "0")}`
  );

  let api: Barretenberg | undefined;
  try {
    api = await newBarretenberg();
    const valid = await new UltraHonkVerifierBackend(api).verifyProof(
      { proof, publicInputs: publicInputsHex, verificationKey: vkBytes },
      { verifierTarget: VERIFIER_TARGET }
    );
    return valid
      ? { ok: true, valid: true, publicInputs: publicInputsHex }
      : { ok: true, valid: false, detail: "bb.js rejected the proof", publicInputs: publicInputsHex };
  } catch (err: any) {
    // bb throws rather than returning false for some malformed proofs and keys. Either
    // way the proof is not accepted; the message says which.
    return { ok: true, valid: false, detail: `bb.js verifier error: ${err?.message ?? String(err)}` };
  } finally {
    await api?.destroy().catch(() => {});
  }
}
