import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prove, sha256Hex, verify } from "../src/index.js";
import { Recipe } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runInMemoryTests() {
  console.log("=================================================================");
  console.log("    TEST SUITE: In-Memory Dynamic Circuit & VK (Zero Disk)       ");
  console.log("=================================================================");

  const recipePath = path.join(__dirname, "..", "examples", "recipe.json");
  const inMemoryRecipe: Recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
  const circuitJson = inMemoryRecipe.verification_package!.circuit_json;
  const circuitRaw = JSON.stringify(circuitJson);
  const vkB64 = inMemoryRecipe.verification_package!.vk_b64!;
  const vkBytes = Buffer.from(vkB64, "base64");

  const baseRecipe: Recipe = {
    ...inMemoryRecipe,
    verification_package: {
      ...inMemoryRecipe.verification_package!,
      circuit_json: undefined,
      circuit_b64: undefined,
      vk_b64: undefined
    }
  };

  const testSaltDir = path.join(os.tmpdir(), `vcc_inmem_salts_${Date.now()}`);
  const testPackageDir = path.join(os.tmpdir(), `vcc_inmem_pkgs_${Date.now()}`);

  // TEST 1: In-Memory Proving (No local circuit files installed)
  console.log("\n--- TEST 1: In-Memory Proving with Embedded circuit_json ---");
  const proveRes = await prove({
    recipe: inMemoryRecipe,
    inputs: {
      "Electricity consumed": "1500.734",
      "Emission factor": "0.421"
    },
    saltDir: testSaltDir,
    packageDir: testPackageDir,
    tag: "inmem_test_1",
    customSalts: {
      r_x: 111n,
      r_y: 222n
    }
  });

  assert(proveRes.ok, `In-memory prove should succeed: ${!proveRes.ok ? (proveRes as any).reason : ""}`);
  console.log("  [PASS] UltraHonk proof generated using embedded circuit_json");

  const pkg = (proveRes as any).package;
  assert(pkg.proof_bytes_b64 && pkg.proof_bytes_b64.length > 0, "Proof bytes generated");

  // TEST 2: In-Memory Verification with Embedded vk_b64
  console.log("\n--- TEST 2: In-Memory Verification with Embedded vk_b64 ---");
  const verifyRes1 = await verify({
    recipe: inMemoryRecipe,
    proofPackage: pkg
  });

  assert(verifyRes1.ok && verifyRes1.valid, `In-memory verify should succeed: ${verifyRes1.detail || verifyRes1.reason}`);
  console.log("  [PASS] UltraHonk proof verified using embedded vk_b64 with zero disk install");

  // TEST 3: Direct Options (vkBytes and circuitJson passed directly)
  console.log("\n--- TEST 3: Direct Function Options (circuitJson & vkBytes) ---");
  const proveResDirect = await prove({
    recipe: baseRecipe, // recipe without embedded fields
    circuitJson: circuitJson,
    inputs: {
      "Electricity consumed": "1500.734",
      "Emission factor": "0.421"
    },
    saltDir: testSaltDir,
    packageDir: testPackageDir,
    tag: "inmem_test_direct"
  });
  assert(proveResDirect.ok, "Prove with direct circuitJson succeeds");
  console.log("  [PASS] Proving succeeded with options.circuitJson");

  const verifyResDirect = await verify({
    recipe: inMemoryRecipe,
    proofPackage: (proveResDirect as any).package,
    vkBytes: vkBytes
  });
  assert(verifyResDirect.ok && verifyResDirect.valid, "Verify with direct vkBytes succeeds");
  console.log("  [PASS] Verification succeeded with options.vkBytes");

  // TEST 4: Base64 Circuit Support (circuit_b64 in recipe)
  console.log("\n--- TEST 4: Base64 Circuit Support (circuit_b64) ---");
  const circuitB64Bytes = Buffer.from(circuitRaw);
  const b64Recipe: Recipe = {
    ...baseRecipe,
    verification_package: {
      ...baseRecipe.verification_package!,
      circuit_hash: sha256Hex(circuitB64Bytes),
      circuit_b64: circuitB64Bytes.toString("base64"),
      vk_b64: vkB64,
      vk_sha256: "8c27b4ca5dc41e6452d3298c5fb323019cbf404d176086cca5783a3197f994e9"
    }
  };
  const proveResB64 = await prove({
    recipe: b64Recipe,
    inputs: {
      "Electricity consumed": "1500.734",
      "Emission factor": "0.421"
    },
    saltDir: testSaltDir,
    packageDir: testPackageDir,
    tag: "inmem_test_b64"
  });
  assert(proveResB64.ok, "Prove with circuit_b64 succeeds");
  console.log("  [PASS] Proving succeeded with base64 encoded circuit");

  // TEST 5: Negative Test - Corrupted vk_b64 Rejected
  console.log("\n--- TEST 5: Security Check - Tampered vk_b64 Rejection ---");
  const corruptedVkB64 = Buffer.from("corrupted_key_bytes").toString("base64");
  const tamperedRecipe: Recipe = {
    ...inMemoryRecipe,
    verification_package: {
      ...inMemoryRecipe.verification_package!,
      vk_b64: corruptedVkB64
    }
  };
  const verifyTampered = await verify({
    recipe: tamperedRecipe,
    proofPackage: pkg
  });
  assert(!verifyTampered.ok, "Tampered VK should be rejected");
  assert(verifyTampered.reason?.includes("Verifying key hash mismatch"), "Rejection reason indicates hash mismatch");
  console.log("  [PASS] Tampered in-memory vk_b64 correctly rejected before verification");

  // Cleanup
  for (const d of [testSaltDir, testPackageDir]) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {}
  }

  console.log("\n=================================================================");
  console.log("ALL IN-MEMORY DYNAMIC TESTS PASSED!");
  console.log("=================================================================\n");
}

runInMemoryTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
