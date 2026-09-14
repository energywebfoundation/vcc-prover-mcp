/**
 * Exact Decimal Encoding and Domain Checks for VCC Prover TS.
 *
 * Implements exact fixed-point scaling: rejects values with excess fractional digits
 * rather than rounding, ensuring client intent is preserved.
 */
import { DomainCheck, EncodeResult } from "./types.js";
/**
 * Encodes a decimal number or string into an integer scaled by 10^places.
 * Rejects values that have more decimal places than allowed.
 */
export declare function encodeExact(decimal: string | number, places: number): EncodeResult;
/**
 * Decodes a scaled integer back into a decimal string representation for display.
 */
export declare function decodeToDecimal(value: bigint | number | string, places: number): string;
/**
 * Validates that an encoded value satisfies the declared domain bounds (min, max).
 */
export declare function checkDomain(name: string, value: bigint | number | string, domain?: DomainCheck): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
