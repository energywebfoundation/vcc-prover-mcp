/**
 * Resolve saltDir following the precedence documented above.
 * `explicit` is whatever the caller (CLI flag or direct prove() argument) passed;
 * pass undefined if nothing was explicitly supplied.
 */
export declare function resolveSaltDir(explicit?: string): string;
/** Resolve packageDir following the same precedence as resolveSaltDir. */
export declare function resolvePackageDir(explicit?: string): string;
