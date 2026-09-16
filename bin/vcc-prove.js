#!/usr/bin/env node

/**
 * vcc-prove CLI: Generates a proof package from a recipe and input parameters.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prove } from "../dist/prove.js";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const die = (msg) => {
  process.stderr.write(`vcc-prove: ${msg}\n`);
  process.exit(1);
};

const recipeArg = opt("recipe");
if (!recipeArg) die("--recipe <file|-> is required");

const inputs = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--input" && args[i + 1]) {
    const eq = args[i + 1].indexOf("=");
    if (eq < 0) die(`--input expects name=value, got "${args[i + 1]}"`);
    inputs[args[i + 1].slice(0, eq)] = args[i + 1].slice(eq + 1);
  }
}

const raw = recipeArg === "-" ? fs.readFileSync(0, "utf-8") : fs.readFileSync(recipeArg, "utf-8");
let recipe;
try {
  recipe = JSON.parse(raw);
} catch (e) {
  die(`could not parse the recipe: ${e.message}`);
}

const installDir = opt("install");
// No hardcoded default here: leave undefined when the flag is absent so
// prove()'s layered resolver (env var > XDG > ~/.vcc)
// gets to decide, instead of this always winning as an "explicit" value.
const saltDir = opt("salt-dir") || undefined;
const packageDir = opt("package-dir") || undefined;

const res = await prove({
  recipe,
  inputs,
  installDir,
  saltDir,
  packageDir
});

if (!res.ok) die(res.reason);

process.stdout.write(
  `${JSON.stringify(
    {
      ...res.package,
      private_values_written_to: res.private_values_written_to,
      package_written_to: res.package_written_to
    },
    null,
    2
  )}\n`
);
