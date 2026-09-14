/**
 * Toolchain Manager for VCC Prover TS.
 *
 * Integrates NoirJS (`@noir-lang/noir_js`) and Barretenberg (`bb.js`) with BN254 scalar field arithmetic.
 */
import { execFile, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Noir } from "@noir-lang/noir_js";
const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// BN254 scalar field modulus
export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// Augment PATH for local npm-installed CLI binaries (bb.js)
const EXTRA_DIRS = [
    path.join(__dirname, "..", "node_modules", ".bin"),
    path.join(__dirname, "node_modules", ".bin")
];
const curPaths = (process.env.PATH || "").split(path.delimiter);
for (const dir of EXTRA_DIRS) {
    if (fs.existsSync(dir) && !curPaths.includes(dir)) {
        curPaths.unshift(dir);
    }
}
process.env.PATH = curPaths.join(path.delimiter);
export const ENV = {
    ...process.env,
    PATH: process.env.PATH
};
/**
 * Resolves the bb.js executable path.
 */
export function getBbJsExecutable() {
    const possiblePaths = [
        path.join(__dirname, "..", "node_modules", ".bin", "bb.js"),
        path.join(__dirname, "node_modules", ".bin", "bb.js")
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p))
            return p;
    }
    return "bb.js";
}
export const BB_JS_BIN = getBbJsExecutable();
/**
 * Cryptographically uniform random field element using rejection sampling.
 */
export function randomFieldElement() {
    for (;;) {
        const candidate = BigInt(`0x${randomBytes(32).toString("hex")}`);
        if (candidate < FIELD_MODULUS)
            return candidate;
    }
}
export function sha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
/**
 * Normalised content hash of compiled circuit JSON.
 */
export function canonicalCircuitHash(bytes) {
    const sort = (v) => Array.isArray(v)
        ? v.map(sort)
        : v && typeof v === "object"
            ? Object.fromEntries(Object.keys(v)
                .sort()
                .map((k) => [k, sort(v[k])]))
            : v;
    try {
        const parsed = typeof bytes === "object" && !Buffer.isBuffer(bytes)
            ? bytes
            : JSON.parse(Buffer.from(bytes).toString("utf-8"));
        return sha256Hex(JSON.stringify(sort(parsed)));
    }
    catch {
        return null;
    }
}
export async function toolchainVersions() {
    const bb_js = "0.58.0 (bb.js)";
    const noir_js = "0.36.0 (NoirJS)";
    return { noir_js, bb_js };
}
/**
 * Initializes the standalone Poseidon2 hasher Noir project from bundled artifact if needed.
 */
export function ensureHasherProject(hasherDir) {
    const targetJson = path.join(hasherDir, "target", "hasher.json");
    if (!fs.existsSync(targetJson)) {
        fs.mkdirSync(path.join(hasherDir, "target"), { recursive: true });
        const possibleBundled = [
            path.join(__dirname, "..", "artifacts", "hasher.json"),
            path.join(__dirname, "artifacts", "hasher.json"),
            path.join(process.cwd(), "artifacts", "hasher.json")
        ];
        for (const src of possibleBundled) {
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, targetJson);
                break;
            }
        }
    }
}
// In-memory cache for loaded Noir circuit instances
const circuitCache = new Map();
function getCachedCircuit(circuitJsonPath) {
    if (!circuitCache.has(circuitJsonPath)) {
        const content = JSON.parse(fs.readFileSync(circuitJsonPath, "utf8"));
        circuitCache.set(circuitJsonPath, content);
    }
    return circuitCache.get(circuitJsonPath);
}
/**
 * Computes Poseidon2(value, salt) over BN254 using NoirJS in-memory ACVM execution.
 */
export async function poseidon2(hasherDir, value, salt, _tag = "h") {
    ensureHasherProject(hasherDir);
    let hasherJsonPath = path.join(hasherDir, "target", "hasher.json");
    if (!fs.existsSync(hasherJsonPath)) {
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
    if (!fs.existsSync(hasherJsonPath)) {
        return { ok: false, reason: `Hasher circuit artifact not found at ${hasherJsonPath}` };
    }
    try {
        const hasherCircuit = getCachedCircuit(hasherJsonPath);
        const noir = new Noir(hasherCircuit);
        let hashHex = "";
        const foreignCallHandler = async (name, inputs) => {
            if (name === "print" && inputs[1] && inputs[1][0]) {
                hashHex = inputs[1][0];
            }
            return [];
        };
        await noir.execute({ val: value.toString(), salt: salt.toString() }, foreignCallHandler);
        if (hashHex) {
            const valInt = BigInt(hashHex);
            return { ok: true, value: `0x${valInt.toString(16).padStart(64, "0")}` };
        }
        return { ok: false, reason: "NoirJS hasher completed without emitting print oracle output" };
    }
    catch (err) {
        return { ok: false, reason: `NoirJS Poseidon2 execution failed: ${err.message}` };
    }
}
/**
 * Solves circuit constraints and generates witness in-memory via NoirJS,
 * then generates the UltraHonk proof with bb.js.
 */
/**
 * Solves circuit constraints and generates witness in-memory via NoirJS,
 * then generates the UltraHonk proof with bb.js.
 * Supports both on-disk circuit project and in-memory circuit JSON.
 */
export async function proveCircuitWithNoirJs(circuitDir, circuitName, inputsMap, tag, circuitSource) {
    const name = `vcc_${tag}`;
    let tmpCircuitPath = null;
    let circuitJsonPath;
    let witnessPath;
    let proofPath;
    let execCwd;
    if (circuitSource) {
        execCwd = os.tmpdir();
        tmpCircuitPath = path.join(os.tmpdir(), `vcc_circuit_${tag}.json`);
        const content = typeof circuitSource === "string" ? circuitSource : JSON.stringify(circuitSource);
        fs.writeFileSync(tmpCircuitPath, content);
        circuitJsonPath = tmpCircuitPath;
        witnessPath = path.join(os.tmpdir(), `${name}.gz`);
        proofPath = path.join(os.tmpdir(), `${name}.proof`);
    }
    else {
        execCwd = circuitDir;
        circuitJsonPath = path.join(circuitDir, "target", `${circuitName}.json`);
        witnessPath = path.join(circuitDir, "target", `${name}.gz`);
        proofPath = path.join(circuitDir, "target", `${name}.proof`);
    }
    const cleanup = () => {
        for (const p of [witnessPath, proofPath, tmpCircuitPath]) {
            if (p) {
                try {
                    if (fs.existsSync(p))
                        fs.unlinkSync(p);
                }
                catch { }
            }
        }
    };
    // 1. Generate witness using NoirJS
    try {
        const circuit = circuitSource || getCachedCircuit(circuitJsonPath);
        const noir = new Noir(circuit);
        const { witness } = await noir.execute(inputsMap);
        // Write gzipped witness buffer returned by NoirJS
        fs.writeFileSync(witnessPath, witness);
    }
    catch (noirErr) {
        cleanup();
        return { ok: false, reason: `NoirJS witness generation failed:\n${noirErr.message}` };
    }
    // 2. Generate UltraHonk proof using bb.js
    try {
        await execFileAsync(BB_JS_BIN, ["prove_ultra_honk", "-b", circuitJsonPath, "-w", witnessPath, "-o", proofPath], {
            cwd: execCwd,
            env: ENV,
            maxBuffer: 64 * 1024 * 1024
        });
        const proof = fs.readFileSync(proofPath);
        cleanup();
        return { ok: true, proof };
    }
    catch (bbErr) {
        cleanup();
        return { ok: false, reason: `bb.js prove_ultra_honk failed:\n${bbErr.stderr || bbErr.message}` };
    }
}
/**
 * Generates UltraHonk proof using NoirJS for witness and bb.js for proving.
 */
export async function proveCircuit(circuitDir, circuitName, inputsMap, tag, circuitSource) {
    return proveCircuitWithNoirJs(circuitDir, circuitName, inputsMap, tag, circuitSource);
}
/**
 * Verifies an UltraHonk proof using bb.js verify_ultra_honk.
 * Accepts either a path to vk on disk or raw vk buffer in-memory.
 */
export async function verifyProofWithBbJs(vk, proofBytes) {
    const tmpProofPath = path.join(os.tmpdir(), `vcc_verify_${randomBytes(8).toString("hex")}.proof`);
    fs.writeFileSync(tmpProofPath, proofBytes);
    let tmpVkPath = null;
    let resolvedVkPath;
    if (typeof vk === "string") {
        resolvedVkPath = vk;
    }
    else {
        tmpVkPath = path.join(os.tmpdir(), `vcc_vk_${randomBytes(8).toString("hex")}.vk`);
        fs.writeFileSync(tmpVkPath, Buffer.from(vk));
        resolvedVkPath = tmpVkPath;
    }
    try {
        const res = spawnSync(BB_JS_BIN, ["verify_ultra_honk", "-k", resolvedVkPath, "-p", tmpProofPath], {
            env: ENV,
            encoding: "utf8"
        });
        if (res.status === 0) {
            return { ok: true, valid: true };
        }
        return { ok: true, valid: false, detail: res.stderr || res.stdout || "Verification failed" };
    }
    catch (err) {
        return { ok: false, valid: false, detail: err.message };
    }
    finally {
        for (const p of [tmpProofPath, tmpVkPath]) {
            if (p && fs.existsSync(p)) {
                try {
                    fs.unlinkSync(p);
                }
                catch { }
            }
        }
    }
}
