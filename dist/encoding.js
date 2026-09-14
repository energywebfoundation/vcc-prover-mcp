/**
 * Exact Decimal Encoding and Domain Checks for VCC Prover TS.
 *
 * Implements exact fixed-point scaling: rejects values with excess fractional digits
 * rather than rounding, ensuring client intent is preserved.
 */
/**
 * Encodes a decimal number or string into an integer scaled by 10^places.
 * Rejects values that have more decimal places than allowed.
 */
export function encodeExact(decimal, places) {
    const text = String(decimal).trim();
    const m = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!m) {
        return {
            ok: false,
            reason: `"${text}" is not a plain decimal number (no exponent notation, no thousands separators)`
        };
    }
    const [, sign, intPart, fracPart = ""] = m;
    if (fracPart.length > places) {
        return {
            ok: false,
            reason: `"${text}" has ${fracPart.length} decimal places but the pinned precision is ${places}. ` +
                `Encoding is exact: it is not rounded to fit, because the circuit cannot tell a ` +
                `quantised value from the one you meant.`
        };
    }
    const digits = `${intPart}${fracPart.padEnd(places, "0")}`;
    const value = BigInt(digits) * (sign === "-" ? -1n : 1n);
    return { ok: true, value };
}
/**
 * Decodes a scaled integer back into a decimal string representation for display.
 */
export function decodeToDecimal(value, places) {
    const v = BigInt(value);
    const neg = v < 0n;
    const abs = neg ? -v : v;
    const digits = abs.toString().padStart(places + 1, "0");
    const cut = digits.length - places;
    const out = places === 0 ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;
    return neg ? `-${out}` : out;
}
/**
 * Validates that an encoded value satisfies the declared domain bounds (min, max).
 */
export function checkDomain(name, value, domain) {
    if (!domain)
        return { ok: true };
    const v = BigInt(value);
    if (domain.min !== undefined && v < BigInt(domain.min)) {
        return {
            ok: false,
            reason: `${name} encodes to ${v}, below the declared minimum ${domain.min}`
        };
    }
    if (domain.max !== undefined && v > BigInt(domain.max)) {
        const shown = domain.max_decimal ? ` (${domain.max_decimal})` : "";
        return {
            ok: false,
            reason: `${name} encodes to ${v}, above the declared maximum ${domain.max}${shown}`
        };
    }
    return { ok: true };
}
