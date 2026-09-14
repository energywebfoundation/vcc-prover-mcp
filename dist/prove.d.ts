/**
 * Generic Schema-Driven Prover for VCC Prover TS.
 *
 * Implements the dual-channel proving flow: public proof package returned,
 * private disclosures written to disk with 0600 permissions.
 */
import { ProveOptions, ProveResult } from "./types.js";
export declare function prove({ recipe, inputs, installDir, circuitDir, circuitJson, circuitBytes, saltDir, packageDir, tag, customSalts }: ProveOptions): Promise<ProveResult>;
