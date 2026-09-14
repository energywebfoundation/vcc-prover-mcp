#!/usr/bin/env node

/**
 * vcc-verify CLI: Verifies a proof package locally against a recipe using bb.js.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { verify } from "../dist/verify.js";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const die = (msg) => {
  process.stderr.write(`vcc-verify: ${msg}\n`);
  process.exit(1);
};

const recipeArg = opt("recipe");
if (!recipeArg) die("--recipe <file|-> is required");
const packageArg = opt("package");
if (!packageArg) die("--package <file|-> is required");

const rawRecipe = recipeArg === "-" ? fs.readFileSync(0, "utf-8") : fs.readFileSync(recipeArg, "utf-8");
let recipe;
try {
  recipe = JSON.parse(rawRecipe);
} catch (e) {
  die(`could not parse recipe: ${e.message}`);
}

const rawPackage = packageArg === "-" ? fs.readFileSync(0, "utf-8") : fs.readFileSync(packageArg, "utf-8");
let proofPackage;
try {
  proofPackage = JSON.parse(rawPackage);
} catch (e) {
  die(`could not parse package: ${e.message}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const installDir = opt("install", path.join(here, "..", "install"));
const vkPath = opt("vk") || undefined;

const res = await verify({
  recipe,
  proofPackage,
  installDir,
  vkPath
});

if (!res.ok || !res.valid) {
  process.stderr.write(`vcc-verify: verification FAILED: ${res.reason || res.detail}\n`);
  process.exit(1);
}

process.stdout.write("vcc-verify: verification SUCCESSFUL (UltraHonk proof valid)\n");
