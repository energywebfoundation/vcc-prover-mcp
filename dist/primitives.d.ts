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
export declare function rescaleAndRound({ operands, divisor, rounding }: RescaleAndRoundOptions): RescaleAndRoundResult;
/**
 * Executes a named derivation primitive as specified in the recipe schema.
 */
export declare function runDerivation(derivation: SchemaDerivation, resolveOperand: (name: string) => bigint): any;
