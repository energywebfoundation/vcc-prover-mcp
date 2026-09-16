/**
 * Native TypeScript MCP Server for VCC Prover TS.
 *
 * Implements standard JSON-RPC 2.0 over stdio for AI agent integration.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { resolveSaltDir, resolvePackageDir } from "./config.js";
import { checkProofShape, withRedactedProof } from "./proof-package.js";
import { prove } from "./prove.js";
import {
  BB_JS_BIN,
  sha256Hex,
  toolchainVersions
} from "./toolchain.js";
import { Recipe } from "./types.js";
import { verify } from "./verify.js";

// installDir has no XDG tier (it's a one-time toolchain
// install location, not proof data), so it keeps its own simple env-var
// fallback. saltDir/packageDir defer entirely to the shared resolver in
// config.ts so env var, XDG, and ~/.vcc all apply consistently
// across the CLI, the MCP server, and prove()'s own internal default.
const DEFAULT_INSTALL_DIR = process.env.VCC_INSTALL_DIR || path.join(os.homedir(), ".vcc", "install");
const DEFAULT_SALT_DIR = resolveSaltDir();
const DEFAULT_PACKAGE_DIR = resolvePackageDir();

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "prove",
    description:
      "Produce a zero-knowledge proof package from private activity data using bb.js and Noir. Writes the full package and private disclosures to disk. Returns the path to the package; does not leak salts in tool response.",
    inputSchema: {
      type: "object",
      properties: {
        recipe: {
          type: "object",
          description: "The recipe object exactly as get_workspace_instructions returned it."
        },
        recipe_path: {
          type: "string",
          description: "File path to recipe.json if recipe object is not provided directly."
        },
        inputs: {
          type: "object",
          description: "The private activity values as decimal strings, keyed by parameter name or meaning.",
          additionalProperties: { type: "string" }
        },
        include_proof: {
          type: "boolean",
          description:
            "Return the raw base64 proof in the response as well as writing it to disk (default: false). Ask for it when you are the one submitting to the Methodology Graph, since submit_proof_package takes the proof as an argument. Send the proof_sha256 from the same response with it: the server checks the two against each other and refuses a proof that was altered on the way."
        }
      },
      required: ["inputs"],
      additionalProperties: false
    }
  },
  {
    name: "verify",
    description:
      "Check an UltraHonk proof package locally against the verifying key using bb.js without network access.",
    inputSchema: {
      type: "object",
      properties: {
        recipe: {
          type: "object",
          description: "The recipe object pinning the formula and verifying key."
        },
        recipe_path: {
          type: "string",
          description: "File path to recipe.json if recipe object is not provided directly."
        },
        package_path: {
          type: "string",
          description: "File path to the proof package JSON written by prove."
        },
        package: {
          type: "object",
          description: "The proof package object if package_path is not provided."
        },
        include_proof: {
          type: "boolean",
          description:
            "Return the verified package including the raw base64 proof (default: false). This is how to read a clean copy back off disk: if submit_proof_package refuses a proof for not matching its proof_sha256, the copy was altered in transit and the one on disk is good. Do not re-prove instead; fresh salts produce a different proof, not the same one again."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "status",
    description: "Report toolchain status (NoirJS, bb.js) and installed formula artifacts.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

export async function runMcpServer(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (id: any, result?: any, error?: any) => {
    const payload: any = { jsonrpc: "2.0", id };
    if (error) payload.error = error;
    else payload.result = result;
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  const sendToolResult = (id: any, text: string, isError = false) => {
    sendResponse(id, {
      content: [{ type: "text", text }],
      isError
    });
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let req: any;
    try {
      req = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const { id, method, params } = req;

    try {
      if (method === "initialize") {
        sendResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: "vcc-prover-ts",
            version: "1.0.0"
          }
        });
      } else if (method === "notifications/initialized") {
        // Notification, no response
      } else if (method === "tools/list") {
        sendResponse(id, { tools: TOOLS });
      } else if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};

        if (name === "status") {
          const versions = await toolchainVersions();
          const circuitTarget = path.join(DEFAULT_INSTALL_DIR, "circuit", "target");
          let vkInstalled = false;
          if (fs.existsSync(path.join(circuitTarget, "vk"))) {
            vkInstalled = true;
          }

          sendToolResult(
            id,
            JSON.stringify(
              {
                toolchain: versions,
                bb_js_executable: BB_JS_BIN,
                ready: Boolean(versions.noir_js && versions.bb_js),
                installed_artifacts: {
                  install_dir: DEFAULT_INSTALL_DIR,
                  vk_present: vkInstalled
                }
              },
              null,
              2
            )
          );
        } else if (name === "prove") {
          let recipe: Recipe = args.recipe;
          if (!recipe && args.recipe_path) {
            if (fs.existsSync(args.recipe_path)) {
              recipe = JSON.parse(fs.readFileSync(args.recipe_path, "utf8"));
            } else {
              sendToolResult(id, `Recipe file not found: ${args.recipe_path}`, true);
              continue;
            }
          }
          if (!recipe) {
            sendToolResult(id, "Either recipe or recipe_path must be provided", true);
            continue;
          }

          const inputs: Record<string, string> = args.inputs;

          const res = await prove({
            recipe,
            inputs,
            installDir: DEFAULT_INSTALL_DIR,
            saltDir: DEFAULT_SALT_DIR,
            packageDir: DEFAULT_PACKAGE_DIR
          });

          if (!res.ok) {
            sendToolResult(id, `Proving failed: ${res.reason}`, true);
          } else {
            const outPkg = args.include_proof ? res.package : withRedactedProof(res.package);
            sendToolResult(
              id,
              JSON.stringify(
                {
                  status: "PROVED",
                  package_written_to: res.package_written_to,
                  private_values_written_to: res.private_values_written_to,
                  summary: res.summary,
                  package: outPkg
                },
                null,
                2
              )
            );
          }
        } else if (name === "verify") {
          let recipe: Recipe = args.recipe;
          if (!recipe && args.recipe_path) {
            if (fs.existsSync(args.recipe_path)) {
              recipe = JSON.parse(fs.readFileSync(args.recipe_path, "utf8"));
            } else {
              sendToolResult(id, `Recipe file not found: ${args.recipe_path}`, true);
              continue;
            }
          }
          if (!recipe) {
            sendToolResult(id, "Either recipe or recipe_path must be provided", true);
            continue;
          }

          let proofPackage = args.package;

          if (!proofPackage && args.package_path) {
            if (fs.existsSync(args.package_path)) {
              proofPackage = JSON.parse(fs.readFileSync(args.package_path, "utf8"));
            } else {
              sendToolResult(id, `Package file not found: ${args.package_path}`, true);
              continue;
            }
          }

          if (!proofPackage) {
            sendToolResult(id, "Either package or package_path must be provided", true);
            continue;
          }

          const res = await verify({
            recipe,
            proofPackage,
            installDir: DEFAULT_INSTALL_DIR
          });

          const verdict: Record<string, unknown> = {
            valid: res.valid,
            reason: res.reason || res.detail || (res.valid ? "Proof is cryptographically valid" : "Verification failed")
          };
          // Only on a valid proof. Handing back the bytes of a package that has just
          // failed verification is handing back something to submit.
          if (args.include_proof && res.valid) {
            verdict.package = proofPackage;
          }

          sendToolResult(id, JSON.stringify(verdict, null, 2));
        } else {
          sendResponse(id, undefined, { code: -32601, message: `Method or tool not found: ${name}` });
        }
      } else {
        sendResponse(id, undefined, { code: -32601, message: `Method not supported: ${method}` });
      }
    } catch (err: any) {
      sendResponse(id, undefined, { code: -32603, message: err.message });
    }
  }
}
