import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}







/**
 * Defines the shared error codes used across all smart contracts in the workspace.
 * 
 * Error codes **must not be renumbered**: external consumers (frontend, indexers,
 * monitoring, audit reports) rely on stable discriminants. Gaps in the sequence
 * indicate reserved codes. New codes MUST be appended at the end.
 */
export const Errors = {
  1: {message:"Unauthorized"},
  2: {message:"NonprofitNotFound"},
  3: {message:"NonprofitNotApproved"},
  4: {message:"NonprofitAlreadyRegistered"},
  5: {message:"CampaignNotFound"},
  6: {message:"CampaignNotActive"},
  8: {message:"EvidenceNotSubmitted"},
  11: {message:"InvalidAmount"},
  12: {message:"InvalidDeadline"},
  13: {message:"InvalidMilestonePercentage"},
  16: {message:"FinalAlreadyReleased"},
  18: {message:"NotVaultAdmin"},
  19: {message:"DepositExceedsTarget"},
  20: {message:"CampaignAlreadyExists"},
  21: {message:"InitialReleaseNotDone"},
  22: {message:"CampaignExpired"},
  23: {message:"VaultFinalized"},
  24: {message:"InvalidEvidence"},
  25: {message:"InvalidFeeBps"},
  /**
   * The vault is configured with an `authorized_router` and the immediate
   * caller is not that router. Direct deposits are rejected.
   */
  26: {message:"NotAuthorizedRouter"}
}

/**
 * Defines the lifecycle states of a nonprofit organization within the registry.
 */
export type NonprofitStatus = {tag: "Pending", values: void} | {tag: "Approved", values: void} | {tag: "Revoked", values: void};


/**
 * Represents the verified identity and legal profile of a nonprofit organization.
 */
export interface NonprofitProfile {
  data_consent: boolean;
  email: string;
  legal_name: string;
  retention_certificate: boolean;
  rut_hash: Buffer;
  status: NonprofitStatus;
  tax_id: string;
}

export interface Client {
  /**
   * Construct and simulate a get_profile transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves the full profile of a registered nonprofit.
   * 
   * # Arguments
   * * `nonprofit` - The address of the nonprofit.
   * 
   * # Returns
   * The `NonprofitProfile`.
   * 
   * # Errors
   * * `NonprofitNotFound` if the address has no profile.
   */
  get_profile: ({nonprofit}: {nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<NonprofitProfile>>

  /**
   * Construct and simulate a is_approved transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Checks if a nonprofit is approved and authorized to operate.
   * 
   * # Arguments
   * * `nonprofit` - The address to check.
   * 
   * # Returns
   * `true` if the nonprofit exists and is `Approved`, otherwise `false`.
   */
  is_approved: ({nonprofit}: {nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a revoke_nonprofit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes an approved nonprofit, preventing it from operating on the platform.
   * 
   * # Arguments
   * * `nonprofit` - The address of the nonprofit to revoke.
   * 
   * # Authorization
   * Only the Admin can call this function.
   * 
   * # Errors
   * * `NonprofitNotFound` if the address has no profile.
   * * `Unauthorized` if the caller is not the Admin.
   */
  revoke_nonprofit: ({admin, nonprofit}: {admin: string, nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a approve_nonprofit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approves a pending nonprofit organization, allowing it to operate on the platform.
   * 
   * # Arguments
   * * `nonprofit` - The address of the nonprofit to approve.
   * 
   * # Authorization
   * Only the Admin can call this function.
   * 
   * # Errors
   * * `NonprofitNotFound` if the address has no profile.
   * * `Unauthorized` if the caller is not the Admin.
   */
  approve_nonprofit: ({admin, nonprofit}: {admin: string, nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a register_nonprofit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a new nonprofit organization in a pending state.
   * 
   * # Arguments
   * * `nonprofit` - The Stellar address of the nonprofit organization.
   * * `profile` - The legal and contact profile of the organization. The `status`
   * field is ignored and forced to `Pending`.
   * 
   * # Authorization
   * The `nonprofit` address must authorize this call.
   * 
   * # Errors
   * * `NonprofitAlreadyRegistered` if the address already has a profile.
   */
  register_nonprofit: ({nonprofit, profile}: {nonprofit: string, profile: NonprofitProfile}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAANJSZXRyaWV2ZXMgdGhlIGZ1bGwgcHJvZmlsZSBvZiBhIHJlZ2lzdGVyZWQgbm9ucHJvZml0LgoKIyBBcmd1bWVudHMKKiBgbm9ucHJvZml0YCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBub25wcm9maXQuCgojIFJldHVybnMKVGhlIGBOb25wcm9maXRQcm9maWxlYC4KCiMgRXJyb3JzCiogYE5vbnByb2ZpdE5vdEZvdW5kYCBpZiB0aGUgYWRkcmVzcyBoYXMgbm8gcHJvZmlsZS4AAAAAAAtnZXRfcHJvZmlsZQAAAAABAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAQAAB9AAAAAQTm9ucHJvZml0UHJvZmlsZQ==",
        "AAAAAAAAAL9DaGVja3MgaWYgYSBub25wcm9maXQgaXMgYXBwcm92ZWQgYW5kIGF1dGhvcml6ZWQgdG8gb3BlcmF0ZS4KCiMgQXJndW1lbnRzCiogYG5vbnByb2ZpdGAgLSBUaGUgYWRkcmVzcyB0byBjaGVjay4KCiMgUmV0dXJucwpgdHJ1ZWAgaWYgdGhlIG5vbnByb2ZpdCBleGlzdHMgYW5kIGlzIGBBcHByb3ZlZGAsIG90aGVyd2lzZSBgZmFsc2VgLgAAAAALaXNfYXBwcm92ZWQAAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAOVJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbmlzdHJhdG9yIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBUaGUgYWRkcmVzcyB0aGF0IHdpbGwgaGF2ZSBhdXRob3JpdHkgdG8gYXBwcm92ZSBhbmQgcmV2b2tlCm5vbnByb2ZpdCByZWdpc3RyYXRpb25zLgoKIyBFcnJvcnMKKiBQYW5pY3MgaWYgdGhlIGNvbnRyYWN0IGhhcyBhbHJlYWR5IGJlZW4gaW5pdGlhbGl6ZWQuAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAATlSZXZva2VzIGFuIGFwcHJvdmVkIG5vbnByb2ZpdCwgcHJldmVudGluZyBpdCBmcm9tIG9wZXJhdGluZyBvbiB0aGUgcGxhdGZvcm0uCgojIEFyZ3VtZW50cwoqIGBub25wcm9maXRgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIG5vbnByb2ZpdCB0byByZXZva2UuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgQWRtaW4gY2FuIGNhbGwgdGhpcyBmdW5jdGlvbi4KCiMgRXJyb3JzCiogYE5vbnByb2ZpdE5vdEZvdW5kYCBpZiB0aGUgYWRkcmVzcyBoYXMgbm8gcHJvZmlsZS4KKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgQWRtaW4uAAAAAAAAEHJldm9rZV9ub25wcm9maXQAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAA",
        "AAAAAAAAAUBBcHByb3ZlcyBhIHBlbmRpbmcgbm9ucHJvZml0IG9yZ2FuaXphdGlvbiwgYWxsb3dpbmcgaXQgdG8gb3BlcmF0ZSBvbiB0aGUgcGxhdGZvcm0uCgojIEFyZ3VtZW50cwoqIGBub25wcm9maXRgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIG5vbnByb2ZpdCB0byBhcHByb3ZlLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIEFkbWluIGNhbiBjYWxsIHRoaXMgZnVuY3Rpb24uCgojIEVycm9ycwoqIGBOb25wcm9maXROb3RGb3VuZGAgaWYgdGhlIGFkZHJlc3MgaGFzIG5vIHByb2ZpbGUuCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNhbGxlciBpcyBub3QgdGhlIEFkbWluLgAAABFhcHByb3ZlX25vbnByb2ZpdAAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAA=",
        "AAAAAAAAAZRSZWdpc3RlcnMgYSBuZXcgbm9ucHJvZml0IG9yZ2FuaXphdGlvbiBpbiBhIHBlbmRpbmcgc3RhdGUuCgojIEFyZ3VtZW50cwoqIGBub25wcm9maXRgIC0gVGhlIFN0ZWxsYXIgYWRkcmVzcyBvZiB0aGUgbm9ucHJvZml0IG9yZ2FuaXphdGlvbi4KKiBgcHJvZmlsZWAgLSBUaGUgbGVnYWwgYW5kIGNvbnRhY3QgcHJvZmlsZSBvZiB0aGUgb3JnYW5pemF0aW9uLiBUaGUgYHN0YXR1c2AKZmllbGQgaXMgaWdub3JlZCBhbmQgZm9yY2VkIHRvIGBQZW5kaW5nYC4KCiMgQXV0aG9yaXphdGlvbgpUaGUgYG5vbnByb2ZpdGAgYWRkcmVzcyBtdXN0IGF1dGhvcml6ZSB0aGlzIGNhbGwuCgojIEVycm9ycwoqIGBOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZGAgaWYgdGhlIGFkZHJlc3MgYWxyZWFkeSBoYXMgYSBwcm9maWxlLgAAABJyZWdpc3Rlcl9ub25wcm9maXQAAAAAAAIAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAAB3Byb2ZpbGUAAAAH0AAAABBOb25wcm9maXRQcm9maWxlAAAAAA==",
        "AAAABQAAADFFbWl0dGVkIHdoZW4gYSBub25wcm9maXQgaXMgcmV2b2tlZCBieSB0aGUgYWRtaW4uAAAAAAAAAAAAABBOb25wcm9maXRSZXZva2VkAAAAAQAAABFub25wcm9maXRfcmV2b2tlZAAAAAAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAADJFbWl0dGVkIHdoZW4gYSBub25wcm9maXQgaXMgYXBwcm92ZWQgYnkgdGhlIGFkbWluLgAAAAAAAAAAABFOb25wcm9maXRBcHByb3ZlZAAAAAAAAAEAAAASbm9ucHJvZml0X2FwcHJvdmVkAAAAAAABAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAAD5FbWl0dGVkIHdoZW4gYSBuZXcgbm9ucHJvZml0IGlzIHJlZ2lzdGVyZWQgaW4gYSBwZW5kaW5nIHN0YXRlLgAAAAAAAAAAABNOb25wcm9maXRSZWdpc3RlcmVkAAAAAAEAAAAUbm9ucHJvZml0X3JlZ2lzdGVyZWQAAAACAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAQAAAAAAAAAKbGVnYWxfbmFtZQAAAAAAEAAAAAAAAAAC",
        "AAAABAAAAS9EZWZpbmVzIHRoZSBzaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIHNtYXJ0IGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKio6IGV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsIGluZGV4ZXJzLAptb25pdG9yaW5nLCBhdWRpdCByZXBvcnRzKSByZWx5IG9uIHN0YWJsZSBkaXNjcmltaW5hbnRzLiBHYXBzIGluIHRoZSBzZXF1ZW5jZQppbmRpY2F0ZSByZXNlcnZlZCBjb2Rlcy4gTmV3IGNvZGVzIE1VU1QgYmUgYXBwZW5kZWQgYXQgdGhlIGVuZC4AAAAAAAAAAAVFcnJvcgAAAAAAABQAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAflRoZSB2YXVsdCBpcyBjb25maWd1cmVkIHdpdGggYW4gYGF1dGhvcml6ZWRfcm91dGVyYCBhbmQgdGhlIGltbWVkaWF0ZQpjYWxsZXIgaXMgbm90IHRoYXQgcm91dGVyLiBEaXJlY3QgZGVwb3NpdHMgYXJlIHJlamVjdGVkLgAAAAAAE05vdEF1dGhvcml6ZWRSb3V0ZXIAAAAAGg==",
        "AAAAAgAAAE1EZWZpbmVzIHRoZSBsaWZlY3ljbGUgc3RhdGVzIG9mIGEgbm9ucHJvZml0IG9yZ2FuaXphdGlvbiB3aXRoaW4gdGhlIHJlZ2lzdHJ5LgAAAAAAAAAAAAAPTm9ucHJvZml0U3RhdHVzAAAAAAMAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAACEFwcHJvdmVkAAAAAAAAAAAAAAAHUmV2b2tlZAA=",
        "AAAAAQAAAE9SZXByZXNlbnRzIHRoZSB2ZXJpZmllZCBpZGVudGl0eSBhbmQgbGVnYWwgcHJvZmlsZSBvZiBhIG5vbnByb2ZpdCBvcmdhbml6YXRpb24uAAAAAAAAAAAQTm9ucHJvZml0UHJvZmlsZQAAAAcAAAAAAAAADGRhdGFfY29uc2VudAAAAAEAAAAAAAAABWVtYWlsAAAAAAAAEAAAAAAAAAAKbGVnYWxfbmFtZQAAAAAAEAAAAAAAAAAVcmV0ZW50aW9uX2NlcnRpZmljYXRlAAAAAAAAAQAAAAAAAAAIcnV0X2hhc2gAAAAOAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAPTm9ucHJvZml0U3RhdHVzAAAAAAAAAAAGdGF4X2lkAAAAAAAQ" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_profile: this.txFromJSON<NonprofitProfile>,
        is_approved: this.txFromJSON<boolean>,
        revoke_nonprofit: this.txFromJSON<null>,
        approve_nonprofit: this.txFromJSON<null>,
        register_nonprofit: this.txFromJSON<null>
  }
}