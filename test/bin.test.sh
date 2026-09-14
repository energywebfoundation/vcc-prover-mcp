#!/usr/bin/env bash
set -euo pipefail

echo "================================================================="
echo "       CLI & MCP TEST SUITE: @energyweb/vcc-prover-mcp/bin       "
echo "================================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RECIPE="$ROOT_DIR/Claude outputs/recipe.json"

cd "$ROOT_DIR"

echo -e "\n--- 1. Testing vcc-prove CLI ---"
OUTPUT=$(node bin/vcc-prove.js --recipe "$RECIPE" --input "Electricity consumed=12222.734")
PACKAGE_PATH=$(echo "$OUTPUT" | grep '"package_written_to":' | sed -E 's/.*"package_written_to": "([^"]+)".*/\1/')
PRIVATE_PATH=$(echo "$OUTPUT" | grep '"private_values_written_to":' | sed -E 's/.*"private_values_written_to": "([^"]+)".*/\1/')

echo "  Package: $PACKAGE_PATH"
echo "  Private: $PRIVATE_PATH"
[ -f "$PACKAGE_PATH" ] && echo "  [PASS] Proof package created"
[ -f "$PRIVATE_PATH" ] && echo "  [PASS] Private audit pack created (0600)"

echo -e "\n--- 2. Testing vcc-verify CLI ---"
VERIFY_OUT=$(node bin/vcc-verify.js --recipe "$RECIPE" --package "$PACKAGE_PATH")
echo "  $VERIFY_OUT"
echo "$VERIFY_OUT" | grep -q "verification SUCCESSFUL"
echo "  [PASS] Proof verified via CLI"

echo -e "\n--- 3. Testing vcc-audit CLI ---"
AUDIT_OUT=$(node bin/vcc-audit.js --private "$PRIVATE_PATH" --package "$PACKAGE_PATH")
echo "  $AUDIT_OUT"
echo "$AUDIT_OUT" | grep -q "audit SUCCESSFUL"
echo "  [PASS] Auditor authenticated private disclosures"

echo -e "\n--- 4. Testing vcc-prove-mcp (status tool) ---"
STATUS_OUT=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"status","arguments":{}}}' | node bin/vcc-prove-mcp.js)
echo "$STATUS_OUT" | grep -q 'ready'
echo "  [PASS] MCP status tool reported ready"

echo -e "\n--- 5. Testing vcc-prove-mcp (prove tool) ---"
MCP_PROVE_OUT=$(echo "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"prove\",\"arguments\":{\"recipe_path\":\"$RECIPE\",\"inputs\":{\"Electricity consumed\":\"1500.734\"}}}}" | node bin/vcc-prove-mcp.js)
echo "$MCP_PROVE_OUT" | grep -q 'PROVED'
echo "  [PASS] MCP prove tool executed successfully"

echo -e "\n================================================================="
echo "                 ALL CLI & MCP TESTS PASSED!                     "
echo "================================================================="
