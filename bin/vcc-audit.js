#!/usr/bin/env node

/**
 * vcc-audit CLI: Authenticates private client disclosures against public proof commitments.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { auditDisclosure } from "../dist/audit.js";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const die = (msg) => {
  process.stderr.write(`vcc-audit: ${msg}\n`);
  process.exit(1);
};

const privateArg = opt("private");
if (!privateArg) die("--private <path> is required");
const packageArg = opt("package");
if (!packageArg) die("--package <path> is required");

let privatePack;
try {
  privatePack = JSON.parse(fs.readFileSync(privateArg, "utf-8"));
} catch (e) {
  die(`could not parse private disclosures: ${e.message}`);
}

let proofPackage;
try {
  proofPackage = JSON.parse(fs.readFileSync(packageArg, "utf-8"));
} catch (e) {
  die(`could not parse package: ${e.message}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const hasherDir = opt("hasher", path.join(here, "..", "install", "hasher"));

const res = await auditDisclosure(privatePack, proofPackage, hasherDir);

if (!res.ok || !res.valid) {
  process.stderr.write(`vcc-audit: audit FAILED: ${res.reason}\n`);
  process.exit(1);
}

process.stdout.write(
  `vcc-audit: audit SUCCESSFUL! All Poseidon2 commitments verified against private disclosures.\n`
);
