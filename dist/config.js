/**
 * Resolves where the prover reads/writes its two data directories:
 *   - saltDir:    private disclosure packs (plaintext + salts), written 0600
 *   - packageDir: public proof packages, safe to move/share
 *
 * Precedence (highest wins):
 *   1. Explicit argument passed to prove()/verify() (CLI --salt-dir / --package-dir)
 *   2. VCC_SALT_DIR / VCC_PACKAGE_DIR environment variables
 *   3. XDG_DATA_HOME/vcc/{private,packages} (XDG Base Directory convention)
 *   4. os.homedir()/.vcc/{private,packages} (default fallback)
 */
import os from "node:os";
import path from "node:path";
function xdgDataHome() {
    return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
}
/**
 * Resolve saltDir following the precedence documented above.
 * `explicit` is whatever the caller (CLI flag or direct prove() argument) passed;
 * pass undefined if nothing was explicitly supplied.
 */
export function resolveSaltDir(explicit) {
    if (explicit)
        return explicit;
    if (process.env.VCC_SALT_DIR)
        return process.env.VCC_SALT_DIR;
    if (process.env.XDG_DATA_HOME)
        return path.join(xdgDataHome(), "vcc", "private");
    return path.join(os.homedir(), ".vcc", "private");
}
/** Resolve packageDir following the same precedence as resolveSaltDir. */
export function resolvePackageDir(explicit) {
    if (explicit)
        return explicit;
    if (process.env.VCC_PACKAGE_DIR)
        return process.env.VCC_PACKAGE_DIR;
    if (process.env.XDG_DATA_HOME)
        return path.join(xdgDataHome(), "vcc", "packages");
    return path.join(os.homedir(), ".vcc", "packages");
}
