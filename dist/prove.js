/**
 * Generic Schema-Driven Prover for VCC Prover TS.
 *
 * Implements the dual-channel proving flow: public proof package returned,
 * private disclosures written to disk with 0600 permissions.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveSaltDir, resolvePackageDir } from "./config.js";
import { checkDomain, decodeToDecimal, encodeExact } from "./encoding.js";
import { runDerivation } from "./primitives.js";
import { PACKAGE_FORMAT_VERSION } from "./proof-package.js";
import { canonicalCircuitHash, poseidon2, proveCircuit, randomFieldElement, sha256Hex, toolchainVersions } from "./toolchain.js";
function paramsByKind(params, kind) {
    return params.filter((p) => p.kind === kind);
}
export async function prove({ recipe, inputs, installDir, circuitDir, circuitJson, circuitBytes, saltDir, packageDir, tag = randomUUID().replace(/-/g, "").slice(0, 12), customSalts }) {
    // Layered resolution (explicit arg > env var > XDG > ~/.vcc).
    // See src/config.ts for the full precedence rules.
    saltDir = resolveSaltDir(saltDir);
    packageDir = resolvePackageDir(packageDir);
    const schema = recipe.input_schema;
    if (!schema?.params) {
        return { ok: false, reason: "The recipe carries no input schema" };
    }
    // Multi-tier circuit resolution: options -> recipe (json or b64) -> filesystem
    let resolvedCircuitJson = circuitJson;
    if (!resolvedCircuitJson && circuitBytes) {
        try {
            resolvedCircuitJson = JSON.parse(Buffer.from(circuitBytes).toString("utf-8"));
        }
        catch {
            return { ok: false, reason: "circuitBytes is not valid JSON" };
        }
    }
    if (!resolvedCircuitJson && recipe.verification_package?.circuit_json) {
        resolvedCircuitJson = recipe.verification_package.circuit_json;
    }
    let circuitRawBytes = circuitBytes ? Buffer.from(circuitBytes) : null;
    if (!resolvedCircuitJson && recipe.verification_package?.circuit_b64) {
        circuitRawBytes = Buffer.from(recipe.verification_package.circuit_b64, "base64");
        try {
            resolvedCircuitJson = JSON.parse(circuitRawBytes.toString("utf-8"));
        }
        catch {
            return { ok: false, reason: "circuit_b64 in recipe is not valid JSON" };
        }
    }
    const effectiveCircuitDir = circuitDir || (installDir ? path.join(installDir, "circuit") : undefined);
    const hasherDir = installDir ? path.join(installDir, "hasher") : undefined;
    const circuitName = recipe.formula.id.replace(/-/g, "_");
    if (!resolvedCircuitJson) {
        if (!effectiveCircuitDir) {
            return {
                ok: false,
                reason: "Compiled circuit not found. Provide circuit_json or circuit_b64 in recipe, or supply circuitDir/installDir."
            };
        }
        const circuitPath = path.join(effectiveCircuitDir, "target", `${circuitName}.json`);
        if (!fs.existsSync(circuitPath)) {
            return {
                ok: false,
                reason: `Compiled circuit not found at ${circuitPath}. Provide circuit_json in recipe or install formula.`
            };
        }
        try {
            resolvedCircuitJson = JSON.parse(fs.readFileSync(circuitPath, "utf-8"));
        }
        catch (e) {
            return { ok: false, reason: `Failed to read compiled circuit at ${circuitPath}: ${e.message}` };
        }
    }
    // Check the circuit against the pin the recipe carries.
    //
    // Two hashes, because the two ends hash different things. The Methodology Graph pins
    // sha256 over the artifact bytes exactly as registered. When the circuit arrives
    // inside the recipe those same bytes are in hand, so the comparison is exact and a
    // mismatch is fatal: proving on regardless would produce a proof against a circuit the
    // workspace was never deployed against, which is the one thing the pin exists to stop.
    //
    // A circuit loaded off local disk is a different case. Noir does not emit
    // byte-identical JSON across toolchain versions, so an installed artifact can be the
    // same circuit and still not hash the same; there the key-sorted canonical hash is the
    // only available signal and it stays advisory unless VCC_STRICT_CIRCUIT_HASH=1.
    const pinnedCircuitHash = recipe.verification_package?.circuit_hash;
    if (pinnedCircuitHash && circuitRawBytes) {
        const rawHash = sha256Hex(circuitRawBytes);
        if (rawHash !== pinnedCircuitHash) {
            return {
                ok: false,
                reason: `Circuit hash mismatch: the recipe pins ${pinnedCircuitHash} but the circuit it carries hashes to ${rawHash}`
            };
        }
    }
    else if (pinnedCircuitHash) {
        const calcHash = canonicalCircuitHash(resolvedCircuitJson);
        if (calcHash && calcHash !== pinnedCircuitHash) {
            if (process.env.VCC_STRICT_CIRCUIT_HASH === "1") {
                return {
                    ok: false,
                    reason: `Circuit hash mismatch: the recipe pins ${pinnedCircuitHash}, and the circuit installed on disk canonicalises to ${calcHash}`
                };
            }
        }
    }
    // The same check for the verifying key, here rather than only in verify. It costs one
    // hash and it fails before a proof that would be refused on submission anyway.
    if (recipe.verification_package?.vk_b64 && recipe.verification_package?.vk_sha256) {
        const vkHash = sha256Hex(Buffer.from(recipe.verification_package.vk_b64, "base64"));
        if (vkHash !== recipe.verification_package.vk_sha256) {
            return {
                ok: false,
                reason: `Verifying key hash mismatch: the recipe pins ${recipe.verification_package.vk_sha256} but the key it carries hashes to ${vkHash}`
            };
        }
    }
    // If relying on local disk installation, check that vk exists
    const hasVkInRecipe = Boolean(recipe.verification_package?.vk_b64 || recipe.verification_package?.vk);
    if (!circuitJson && !circuitBytes && !recipe.verification_package?.circuit_json && !recipe.verification_package?.circuit_b64) {
        const vkPath = effectiveCircuitDir ? path.join(effectiveCircuitDir, "target", "vk") : null;
        if (!hasVkInRecipe && (!vkPath || !fs.existsSync(vkPath))) {
            return {
                ok: false,
                reason: `Verifying key not found at ${vkPath || "local circuit"} and not provided in recipe verification_package`
            };
        }
    }
    const decimals = schema.precision.decimals;
    if (typeof decimals !== "number") {
        return { ok: false, reason: "The recipe declares no encoding precision" };
    }
    // 1. Process Private Inputs
    const encodedValues = new Map();
    const rawInputsRecord = {};
    for (const p of paramsByKind(schema.params, "private_input")) {
        const supplied = inputs[p.name] ?? (p.meaning ? inputs[p.meaning] : null);
        if (supplied === null || supplied === undefined) {
            return {
                ok: false,
                reason: `Missing input for ${p.name}${p.meaning ? ` (${p.meaning})` : ""}`
            };
        }
        rawInputsRecord[p.name] = supplied;
        const enc = encodeExact(supplied, p.decimals ?? decimals);
        if (!enc.ok)
            return { ok: false, reason: `${p.name}: ${enc.reason}` };
        const dom = checkDomain(p.name, enc.value, p.domain);
        if (!dom.ok)
            return { ok: false, reason: dom.reason };
        encodedValues.set(p.name, enc.value);
    }
    // 2. Process Public Inputs
    for (const p of paramsByKind(schema.params, "public_input")) {
        const supplied = inputs[p.name] ?? (p.meaning ? inputs[p.meaning] : null);
        if (supplied === null || supplied === undefined) {
            return {
                ok: false,
                reason: `Missing public input for ${p.name}${p.meaning ? ` (${p.meaning})` : ""}`
            };
        }
        const enc = encodeExact(supplied, p.decimals ?? decimals);
        if (!enc.ok)
            return { ok: false, reason: `${p.name}: ${enc.reason}` };
        const dom = checkDomain(p.name, enc.value, p.domain);
        if (!dom.ok)
            return { ok: false, reason: dom.reason };
        encodedValues.set(p.name, enc.value);
    }
    // 2b. Process Coefficients (e.g. emission_factor_encoded)
    for (const p of paramsByKind(schema.params, "coefficient")) {
        const supplied = inputs[p.name] ?? (p.meaning ? inputs[p.meaning] : null);
        let val;
        if (supplied !== null && supplied !== undefined) {
            const enc = encodeExact(supplied, p.decimals ?? decimals);
            if (!enc.ok)
                return { ok: false, reason: `${p.name}: ${enc.reason}` };
            val = enc.value;
        }
        else {
            const pinnedEncoded = recipe.factor?.value_encoded ??
                recipe.factors?.[p.name] ??
                recipe.factors?.emission_factor;
            if (pinnedEncoded === undefined || pinnedEncoded === null) {
                return { ok: false, reason: `The recipe carries no pinned value for ${p.name}` };
            }
            val = BigInt(pinnedEncoded);
        }
        const dom = checkDomain(p.name, val, p.domain);
        if (!dom.ok)
            return { ok: false, reason: dom.reason };
        encodedValues.set(p.name, val);
    }
    // 3. Process Derivations
    const derivedWitnessesRecord = {};
    for (const derivation of schema.derivations ?? []) {
        const result = runDerivation(derivation, (opName) => {
            const v = encodedValues.get(opName);
            if (v === undefined)
                throw new Error(`Derivation operand "${opName}" not found`);
            return v;
        });
        if (derivation.produces) {
            for (const [key, paramName] of Object.entries(derivation.produces)) {
                const val = BigInt(result[key]);
                encodedValues.set(paramName, val);
                derivedWitnessesRecord[paramName] = val.toString();
            }
        }
        if (result.output !== undefined) {
            const outVal = BigInt(result.output);
            encodedValues.set("output", outVal);
            encodedValues.set("<output>", outVal);
            encodedValues.set("y_encoded", outVal);
        }
    }
    // 4. Generate Salts
    const salts = new Map();
    for (const p of paramsByKind(schema.params, "salt")) {
        let s;
        if (customSalts && customSalts[p.name] !== undefined) {
            s = BigInt(customSalts[p.name]);
        }
        else {
            s = randomFieldElement();
        }
        salts.set(p.name, s);
        encodedValues.set(p.name, s);
    }
    // 5. Compute Poseidon2 Commitments
    const commitmentsRecord = {};
    for (const p of paramsByKind(schema.params, "commitment")) {
        const target = p.commitment_of ?? p.commits_to;
        const saltParam = p.salt ?? p.salt_param;
        if (!target || !saltParam) {
            return { ok: false, reason: `Commitment ${p.name} missing commitment_of or salt declaration` };
        }
        const val = target === "<output>"
            ? (encodedValues.get("output") ?? encodedValues.get("y_encoded"))
            : encodedValues.get(target);
        if (val === undefined) {
            return { ok: false, reason: `Value "${target}" to commit by ${p.name} not found` };
        }
        const salt = salts.get(saltParam) ?? encodedValues.get(saltParam);
        if (salt === undefined) {
            return { ok: false, reason: `Salt "${saltParam}" for commitment ${p.name} not found` };
        }
        const commRes = await poseidon2(hasherDir, val, salt, `${tag}_${p.name}`);
        if (!commRes.ok)
            return commRes;
        commitmentsRecord[p.name] = commRes.value;
        encodedValues.set(p.name, BigInt(commRes.value));
    }
    // 6. Build inputs map for NoirJS matching schema params
    const inputsMap = {};
    for (const p of schema.params) {
        const v = encodedValues.get(p.name);
        if (v === undefined) {
            return { ok: false, reason: `Parameter "${p.name}" has no computed value for circuit` };
        }
        inputsMap[p.name] = v.toString();
    }
    // 7. Solve witness with NoirJS and prove with bb.js prove_ultra_honk
    const proveRes = await proveCircuit(effectiveCircuitDir, circuitName, inputsMap, tag, resolvedCircuitJson);
    if (!proveRes.ok)
        return proveRes;
    const proofBytes = proveRes.proof;
    const proofB64 = proofBytes.toString("base64");
    const proofHash = sha256Hex(proofBytes);
    // 8. Public Signals
    //
    // Two views of one thing. The by-name record is what a human reading the package off
    // disk wants; the ordered array of 0x-prefixed field values is the shape
    // submit_proof_package declares, and building it here is what saves the agent from
    // reassembling it by hand from public_signal_order on the way to submitting.
    const publicSignals = {};
    const publicSignalsOrdered = [];
    for (const sigName of schema.public_signal_order) {
        const val = encodedValues.get(sigName);
        publicSignals[sigName] = val !== undefined ? val.toString() : "";
        publicSignalsOrdered.push(val !== undefined ? `0x${val.toString(16).padStart(64, "0")}` : "");
    }
    const versions = await toolchainVersions();
    const proofPackage = {
        // The version the Methodology Graph speaks, taken from the recipe where it states
        // one. Named package_format_version because that is the argument submit_proof_package
        // reads; the old format_version carried the MCP protocol date, which it refuses.
        package_format_version: recipe.package_format_version ?? PACKAGE_FORMAT_VERSION,
        formula: {
            id: recipe.formula.id,
            version: recipe.formula.version
        },
        // Where this package is destined, copied from the recipe so the agent submitting it
        // has the workspace id to hand without going back for the recipe. No credential is
        // here or anywhere else in this package.
        submit_via: recipe.submit_via ?? null,
        recipe_cid: recipe.recipe_cid,
        public_signals: publicSignalsOrdered,
        public_signals_named: publicSignals,
        public_signals_order: schema.public_signal_order,
        commitments: commitmentsRecord,
        proof_type: "UltraHonk",
        proof_bytes_b64: proofB64,
        proof_sha256: proofHash,
        // What actually produced the proof, not what the recipe pins. The server records this
        // as provenance without checking it, so reporting the pinned versions instead would be
        // a claim it cannot catch and nobody asked for. Witness solving is NoirJS and proving
        // is bb.js; nargo never runs here.
        toolchain: {
            nargo: versions.noir_js || undefined,
            bb: versions.bb_js || undefined,
            poseidon: recipe.verification_package?.pinned?.poseidon || undefined
        },
        metadata: {
            noir_js_version: versions.noir_js || undefined,
            bb_version: versions.bb_js || undefined,
            timestamp: new Date().toISOString()
        }
    };
    // 9. Write Private Disclosures to Disk with 0600 mode
    fs.mkdirSync(saltDir, { recursive: true, mode: 0o700 });
    const privateValuesPath = path.join(saltDir, `${tag}.json`);
    const encodedInputsRecord = {};
    for (const [k, v] of encodedValues.entries()) {
        encodedInputsRecord[k] = v.toString();
    }
    const saltsRecord = {};
    for (const [k, v] of salts.entries()) {
        saltsRecord[k] = v.toString();
    }
    const outputVal = encodedValues.get("output") ?? encodedValues.get("y_encoded") ?? 0n;
    const privateAudit = {
        formula: {
            id: recipe.formula.id,
            version: recipe.formula.version
        },
        tag,
        created_at: new Date().toISOString(),
        inputs_raw: rawInputsRecord,
        inputs_encoded: encodedInputsRecord,
        salts: saltsRecord,
        commitments: commitmentsRecord,
        derived_witnesses: derivedWitnessesRecord,
        plaintext_output: {
            encoded: outputVal.toString(),
            decimal: decodeToDecimal(outputVal, decimals)
        }
    };
    fs.writeFileSync(privateValuesPath, JSON.stringify(privateAudit, null, 2), {
        encoding: "utf8",
        mode: 0o600
    });
    // 10. Write Public Package to Disk
    fs.mkdirSync(packageDir, { recursive: true, mode: 0o755 });
    const packagePath = path.join(packageDir, `${tag}.json`);
    fs.writeFileSync(packagePath, JSON.stringify(proofPackage, null, 2), "utf8");
    return {
        ok: true,
        package: proofPackage,
        package_written_to: packagePath,
        private_values_written_to: privateValuesPath,
        summary: {
            formula: `${recipe.formula.id} ${recipe.formula.version}`,
            proof_sha256: proofHash,
            public_signals: publicSignals
        }
    };
}
