#!/usr/bin/env node

/**
 * vcc-usage CLI: Displays the comprehensive USAGE.md guide in terminal.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usagePath = path.join(__dirname, "..", "USAGE.md");

if (fs.existsSync(usagePath)) {
  const content = fs.readFileSync(usagePath, "utf-8");
  process.stdout.write(content.endsWith("\n") ? content : content + "\n");
} else {
  process.stderr.write("vcc-usage: USAGE.md documentation not found in package installation.\n");
  process.exit(1);
}
