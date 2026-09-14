#!/usr/bin/env node

/**
 * vcc-prove-mcp: MCP server runner (Node.js ESM).
 */

import { runMcpServer } from "../dist/mcp-server.js";

runMcpServer().catch((err) => {
  process.stderr.write(`Fatal MCP server error: ${err.message}\n`);
  process.exit(1);
});
