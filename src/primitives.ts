/**
 * Circuit Derivation Primitives for VCC Prover TS.
 *
 * Implements fixed-point arithmetic primitives matching circuit constraints.
 */

import { RescaleAndRoundOptions, RescaleAndRoundResult, SchemaDerivation } from "./types.js";

/**
 * Rescales a product of operands by dividing by divisor, with round-half-up logic.
 * Enforces raw_product = quotient * divisor + remainder, with bump = 1 if remainder * 2 >= divisor.
 */
export function rescaleAndRound({
  operands,
  divisor,
  rounding
}: RescaleAndRoundOptions): RescaleAndRoundResult {
  if (rounding !== "half_up") {
    throw new Error(`rescale_and_round: unsupported rounding rule "${rounding}"`);
  }

  const d = BigInt(divisor);
  if (d <= 0n) {
    throw new Error("rescale_and_round: divisor must be positive");
  }

  const raw = operands.map(BigInt).reduce((a, b) => a * b, 1n);
  const quotient = raw / d;
  const remainder = raw % d;

  // Round-half-up threshold
  const bump = remainder * 2n >= d ? 1n : 0n;

  return {
    raw,
    quotient,
    remainder,
    bump,
    output: quotient + bump
  };
}

const PRIMITIVES: Record<string, Record<string, (opts: any) => any>> = {
  rescale_and_round: {
    "1": rescaleAndRound
  }
};

/**
 * Executes a named derivation primitive as specified in the recipe schema.
 */
export function runDerivation(
  derivation: SchemaDerivation,
  resolveOperand: (name: string) => bigint
): any {
  const family = PRIMITIVES[derivation.primitive];
  if (!family) {
    throw new Error(
      `unknown derivation primitive "${derivation.primitive}"; supported: ${Object.keys(PRIMITIVES).join(", ")}`
    );
  }

  const version = derivation.primitive_version ?? "1";
  const impl = family[version];
  if (!impl) {
    throw new Error(`derivation primitive "${derivation.primitive}" has no version ${version}`);
  }

  return impl({
    operands: derivation.operands.map(resolveOperand),
    divisor: derivation.divisor ?? 1000n,
    rounding: derivation.rounding ?? "half_up"
  });
}
