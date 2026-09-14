/**
 * Third-Party Auditor Verification for VCC Prover TS.
 *
 * Verifies private disclosure openings (values + salts) against public commitments.
 */
import { poseidon2 } from "./toolchain.js";
export async function auditDisclosure(auditPack, proofPackage, hasherDir) {
    const checks = {};
    // Verify each commitment in the audit pack
    for (const [commName, claimedCommitment] of Object.entries(auditPack.commitments)) {
        const receiptComm = proofPackage.commitments[commName];
        if (!receiptComm) {
            return {
                ok: false,
                valid: false,
                reason: `Commitment ${commName} is missing from the public proof package`
            };
        }
        if (claimedCommitment !== receiptComm) {
            return {
                ok: false,
                valid: false,
                reason: `Commitment ${commName} claimed in disclosure does not match receipt`
            };
        }
        // Determine value and salt name
        // By convention: c_x -> electricity_kwh_encoded & r_x, c_y -> output/y_encoded & r_y
        let valueStr;
        let saltStr;
        if (commName === "c_x") {
            valueStr = auditPack.inputs_encoded.electricity_kwh_encoded;
            saltStr = auditPack.salts.r_x;
        }
        else if (commName === "c_y") {
            valueStr = auditPack.inputs_encoded.y_encoded ?? auditPack.plaintext_output.encoded;
            saltStr = auditPack.salts.r_y;
        }
        if (valueStr && saltStr) {
            const recomputed = await poseidon2(hasherDir, BigInt(valueStr), BigInt(saltStr), `audit_${commName}`);
            if (!recomputed.ok) {
                return { ok: false, valid: false, reason: `Failed recomputing commitment ${commName}: ${recomputed.reason}` };
            }
            const match = recomputed.value.toLowerCase() === receiptComm.toLowerCase();
            checks[`${commName}_match`] = match;
            if (!match) {
                return {
                    ok: true,
                    valid: false,
                    reason: `Recomputed ${commName} (${recomputed.value}) does not match receipt (${receiptComm})`,
                    checks
                };
            }
        }
    }
    return { ok: true, valid: true, checks };
}
