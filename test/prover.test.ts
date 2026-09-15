/**
 * End-to-End Test Suite for @energyweb/vcc-prover-ts.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditDisclosure,
  checkDomain,
  decodeToDecimal,
  encodeExact,
  poseidon2,
  prove,
  rescaleAndRound,
  toolchainVersions,
  verify
} from "../src/index.js";
import { Recipe } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log("=================================================================");
  console.log("         TEST SUITE: @energyweb/vcc-prover-ts (bb.js)            ");
  console.log("=================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Toolchain Check
  console.log("\n--- TEST 1: Toolchain Detection ---");
  const versions = await toolchainVersions();
  console.log("  Detected:", versions);
  assert(versions.noir_js !== null, "NoirJS detected");
  assert(versions.bb_js !== null, "bb.js detected");

  // 2. Encoding Checks
  console.log("\n--- TEST 2: Exact Encoding & Domain Checks ---");
  const enc1 = encodeExact("1500.734", 3);
  assert(enc1.ok && enc1.value === 1500734n, "Exact 3-decimal string encoded to 1500734");

  const encInexact = encodeExact("1500.7342", 3);
  assert(!encInexact.ok, "Inexact 4-decimal input rejected when 3 decimals pinned");

  const decoded = decodeToDecimal(1500734n, 3);
  assert(decoded === "1500.734", "Decoded correctly back to 1500.734");

  const domValid = checkDomain("test", 1500734n, { min: 0, max: "999999999999" });
  assert(domValid.ok, "Domain check passes for valid in-range input");

  const domOverflow = checkDomain("test", 1000000000000n, { min: 0, max: "999999999999" });
  assert(!domOverflow.ok, "Domain check rejects overflow value");

  // 3. Rescale and Round Math
  console.log("\n--- TEST 3: Rescale and Round Math ---");
  const mathRes = rescaleAndRound({
    operands: [1500734n, 421n],
    divisor: 1000n,
    rounding: "half_up"
  });
  // raw_product = 631809014 -> quotient = 631809, remainder = 14, bump = 0 -> output = 631809
  assert(mathRes.output === 631809n, "Math matches Noir test vector (output = 631809)");
  assert(mathRes.remainder === 14n, "Remainder is 14");
  assert(mathRes.bump === 0n, "Round bump is 0");

  // Round-half-up bump test
  const bumpRes = rescaleAndRound({
    operands: [1000n, 1500n], // 1500000 / 1000 = 1500 remainder 0
    divisor: 1000n,
    rounding: "half_up"
  });
  const bumpRes2 = rescaleAndRound({
    operands: [1001n, 500n], // 500500 / 1000 = 500 remainder 500 -> bump 1
    divisor: 1000n,
    rounding: "half_up"
  });
  assert(bumpRes2.bump === 1n && bumpRes2.output === 501n, "Round-half-up bumps at remainder >= 500");

  // 4. Standalone Poseidon2 Hashing
  console.log("\n--- TEST 4: Verified Poseidon2 Circuit Delegation ---");
  const hasherDir = path.join(__dirname, "..", "..", "mcp-test", "hasher");
  const hashRes = await poseidon2(hasherDir, 1540250n, 111n, "test_h1");
  assert(hashRes.ok, "Poseidon2 hash computed via Noir constraint");
  if (hashRes.ok) {
    assert(
      hashRes.value === "0x25af96ffd84dd372a09a883060bf65e781eae33905d64c4c8c597cda6057b2c4",
      "Poseidon2 hash matches exact Python / Noir test reference"
    );
  }

  // 5. End-to-End Proving and Verification with bb.js
  console.log("\n--- TEST 5: End-to-End Proving and bb.js Verification ---");
  const recipePath = path.join(__dirname, "..", "examples", "recipe.json");
  const recipe: Recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));

  const testSaltDir = path.join(os.tmpdir(), `vcc_test_salts_${Date.now()}`);
  const testPackageDir = path.join(os.tmpdir(), `vcc_test_packages_${Date.now()}`);

  const proveResult = await prove({
    recipe,
    inputs: {
      "Electricity consumed": "1500.734",
      "Emission factor": "0.421"
    },
    saltDir: testSaltDir,
    packageDir: testPackageDir,
    tag: "test_run_1",
    customSalts: {
      r_x: 111n,
      r_y: 222n
    }
  });

  assert(proveResult.ok, "Proving completed successfully with bb.js");

  if (proveResult.ok) {
    const pkg = proveResult.package;
    assert(pkg.proof_bytes_b64.length > 0, "Proof binary produced in base64");
    assert(pkg.commitments.c_x !== undefined, "Commitment C_X present in public package");
    assert(pkg.commitments.c_y !== undefined, "Commitment C_Y present in public package");
    assert(fs.existsSync(proveResult.package_written_to!), "Public package saved to disk");
    assert(fs.existsSync(proveResult.private_values_written_to!), "Private audit pack saved to disk (0600)");
    assert(pkg.metadata?.noir_js_version !== undefined, "NoirJS version recorded in proof package metadata");

    // Verification check with bb.js
    console.log("\n--- TEST 6: Local bb.js UltraHonk Proof Verification ---");
    const verifyResult = await verify({
      recipe,
      proofPackage: pkg
    });

    assert(verifyResult.ok && verifyResult.valid, "bb.js successfully verified the UltraHonk proof!");

    // Audit check
    console.log("\n--- TEST 7: Third-Party Auditor Commitment Authentication ---");
    const auditPack = JSON.parse(fs.readFileSync(proveResult.private_values_written_to!, "utf8"));
    const auditResult = await auditDisclosure(auditPack, pkg);

    assert(auditResult.ok && auditResult.valid, "Auditor verified private disclosure openings against commitments");
    assert(auditPack.plaintext_output.encoded === "631809", "Audit pack plaintext output matches expected (631809)");

    // Negative Test: Corrupt Proof
    console.log("\n--- TEST 8: Rejection of Corrupted Proof ---");
    const corruptedPkg = JSON.parse(JSON.stringify(pkg));
    const rawProof = Buffer.from(corruptedPkg.proof_bytes_b64, "base64");
    rawProof[50] = (rawProof[50] + 1) % 256;
    corruptedPkg.proof_bytes_b64 = rawProof.toString("base64");

    const corruptVerify = await verify({
      recipe,
      proofPackage: corruptedPkg
    });

    assert(corruptVerify.valid === false, "Mutated proof correctly rejected by bb.js verifier");
  }

  // Clean up test directories
  try {
    fs.rmSync(testSaltDir, { recursive: true, force: true });
    fs.rmSync(testPackageDir, { recursive: true, force: true });
  } catch {}

  console.log("\n=================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
