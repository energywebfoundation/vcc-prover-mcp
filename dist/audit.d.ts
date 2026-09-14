/**
 * Third-Party Auditor Verification for VCC Prover TS.
 *
 * Verifies private disclosure openings (values + salts) against public commitments.
 */
import { AuditResult, PrivateAuditPack, ProofPackage } from "./types.js";
export declare function auditDisclosure(auditPack: PrivateAuditPack, proofPackage: ProofPackage, hasherDir?: string): Promise<AuditResult>;
