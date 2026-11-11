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
 * Shared error codes used across all contracts in the workspace.
 * 
 * # Stability Contract
 * Error codes **must not be renumbered**. External consumers (frontend,
 * indexers, monitoring dashboards, audit reports) rely on stable numeric
 * discriminants. Gaps in the sequence indicate reserved codes. New codes
 * MUST be appended at the end.
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
  /**
   * The milestone percentage is outside the allowed range
   * (`MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE`).
   * 
   * The upper bound (90%) guarantees that at least 10% of the target
   * remains tied to evidence validation.
   */
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
  26: {message:"NotAuthorizedRouter"},
  /**
   * Refund not available: campaign still active or initial release done.
   */
  27: {message:"RefundNotAvailable"},
  /**
   * The donor has no contribution to refund.
   */
  28: {message:"NothingToRefund"},
  /**
   * Provided evidence hash does not match the stored one.
   */
  29: {message:"InvalidEvidenceHash"},
  /**
   * Caller is not the configured verifier.
   */
  30: {message:"NotVerifier"},
  /**
   * Caller is not the pending admin.
   */
  31: {message:"NotPendingAdmin"},
  /**
   * The vault is paused; deposits are blocked.
   */
  32: {message:"VaultPaused"}
}

/**
 * Lifecycle states of a nonprofit organization within the registry.
 */
export type NonprofitStatus = {tag: "Pending", values: void} | {tag: "Approved", values: void} | {tag: "Revoked", values: void};


/**
 * Verified identity and legal profile of a nonprofit organization.
 * 
 * # Privacy
 * Personal data (email, RUT) is stored off-chain. On-chain we keep only
 * cryptographic hashes so the profile is verifiable without exposing PII.
 * This aligns with Colombia's Ley 1581 de 2012 (Habeas Data).
 */
export interface NonprofitProfile {
  /**
 * Whether the organization consented to data processing (Habeas Data).
 */
data_consent: boolean;
  /**
 * SHA-256 hash of the contact email stored off-chain.
 */
email_hash: Buffer;
  /**
 * Legal name of the organization.
 */
legal_name: string;
  /**
 * Whether the organization holds a special tax retention certificate.
 */
retention_certificate: boolean;
  /**
 * SHA-256 hash of the RUT document stored off-chain.
 */
rut_hash: Buffer;
  /**
 * Current approval state.
 */
status: NonprofitStatus;
  /**
 * Tax identification number (NIT in Colombia). Public by nature.
 */
tax_id: string;
}

export interface Client {
  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current admin.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_profile transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the full profile of a registered nonprofit.
   * 
   * # Errors
   * * `NonprofitNotFound` if the address has no profile.
   */
  get_profile: ({nonprofit}: {nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<NonprofitProfile>>

  /**
   * Construct and simulate a is_approved transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if the nonprofit exists and is approved.
   * 
   * Designed to be called cross-contract from `campaign-registry` and
   * `campaign-vault`. A missing profile returns `false` rather than
   * panicking, so callers can branch cleanly.
   */
  is_approved: ({nonprofit}: {nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts the pending admin role.
   * 
   * # Authorization
   * Only the pending admin can accept.
   * 
   * # Errors
   * * `Unauthorized` if there is no pending admin.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Proposes a new admin. The proposal must be accepted by the new admin.
   * 
   * # Authorization
   * Only the current admin can propose.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the current admin.
   */
  propose_admin: ({admin, new_admin}: {admin: string, new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a revoke_nonprofit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes an approved nonprofit.
   * 
   * # Note
   * Revocation does not cancel existing campaigns. See
   * `docs/known-limitations.md` (L1) for the rationale and mitigation.
   * 
   * # Authorization
   * Only the admin can revoke.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the admin.
   * * `NonprofitNotFound` if the address has no profile.
   */
  revoke_nonprofit: ({admin, nonprofit}: {admin: string, nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a approve_nonprofit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approves a pending nonprofit, enabling it to create campaigns.
   * 
   * # Authorization
   * Only the admin can approve.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the admin.
   * * `NonprofitNotFound` if the address has no profile.
   */
  approve_nonprofit: ({admin, nonprofit}: {admin: string, nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the pending admin, if any.
   */
  get_pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a register_nonprofit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a new nonprofit in a pending state.
   * 
   * The `status` field of the input is ignored and forced to `Pending`.
   * This prevents a caller from registering themselves as approved.
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
      new ContractSpec([ "AAAAAAAAABpSZXR1cm5zIHRoZSBjdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAHJSZXR1cm5zIHRoZSBmdWxsIHByb2ZpbGUgb2YgYSByZWdpc3RlcmVkIG5vbnByb2ZpdC4KCiMgRXJyb3JzCiogYE5vbnByb2ZpdE5vdEZvdW5kYCBpZiB0aGUgYWRkcmVzcyBoYXMgbm8gcHJvZmlsZS4AAAAAAAtnZXRfcHJvZmlsZQAAAAABAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAQAAB9AAAAAQTm9ucHJvZml0UHJvZmlsZQ==",
        "AAAAAAAAAORSZXR1cm5zIGB0cnVlYCBpZiB0aGUgbm9ucHJvZml0IGV4aXN0cyBhbmQgaXMgYXBwcm92ZWQuCgpEZXNpZ25lZCB0byBiZSBjYWxsZWQgY3Jvc3MtY29udHJhY3QgZnJvbSBgY2FtcGFpZ24tcmVnaXN0cnlgIGFuZApgY2FtcGFpZ24tdmF1bHRgLiBBIG1pc3NpbmcgcHJvZmlsZSByZXR1cm5zIGBmYWxzZWAgcmF0aGVyIHRoYW4KcGFuaWNraW5nLCBzbyBjYWxsZXJzIGNhbiBicmFuY2ggY2xlYW5seS4AAAALaXNfYXBwcm92ZWQAAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAIxBY2NlcHRzIHRoZSBwZW5kaW5nIGFkbWluIHJvbGUuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgcGVuZGluZyBhZG1pbiBjYW4gYWNjZXB0LgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGVyZSBpcyBubyBwZW5kaW5nIGFkbWluLgAAAAxhY2NlcHRfYWRtaW4AAAAAAAAAAA==",
        "AAAAAAAAALFJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbiBhZGRyZXNzLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gQWRkcmVzcyBhdXRob3JpemVkIHRvIGFwcHJvdmUgYW5kIHJldm9rZSBub25wcm9maXRzLgpDYW4gYmUgYW4gRU9BIChgRy4uLmApIG9yIGEgc21hcnQgYWNjb3VudCAoYEMuLi5gKS4AAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAL1Qcm9wb3NlcyBhIG5ldyBhZG1pbi4gVGhlIHByb3Bvc2FsIG11c3QgYmUgYWNjZXB0ZWQgYnkgdGhlIG5ldyBhZG1pbi4KCiMgQXV0aG9yaXphdGlvbgpPbmx5IHRoZSBjdXJyZW50IGFkbWluIGNhbiBwcm9wb3NlLgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgY3VycmVudCBhZG1pbi4AAAAAAAANcHJvcG9zZV9hZG1pbgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAThSZXZva2VzIGFuIGFwcHJvdmVkIG5vbnByb2ZpdC4KCiMgTm90ZQpSZXZvY2F0aW9uIGRvZXMgbm90IGNhbmNlbCBleGlzdGluZyBjYW1wYWlnbnMuIFNlZQpgZG9jcy9rbm93bi1saW1pdGF0aW9ucy5tZGAgKEwxKSBmb3IgdGhlIHJhdGlvbmFsZSBhbmQgbWl0aWdhdGlvbi4KCiMgQXV0aG9yaXphdGlvbgpPbmx5IHRoZSBhZG1pbiBjYW4gcmV2b2tlLgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4uCiogYE5vbnByb2ZpdE5vdEZvdW5kYCBpZiB0aGUgYWRkcmVzcyBoYXMgbm8gcHJvZmlsZS4AAAAQcmV2b2tlX25vbnByb2ZpdAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAA=",
        "AAAAAAAAANtBcHByb3ZlcyBhIHBlbmRpbmcgbm9ucHJvZml0LCBlbmFibGluZyBpdCB0byBjcmVhdGUgY2FtcGFpZ25zLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIGFkbWluIGNhbiBhcHByb3ZlLgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4uCiogYE5vbnByb2ZpdE5vdEZvdW5kYCBpZiB0aGUgYWRkcmVzcyBoYXMgbm8gcHJvZmlsZS4AAAAAEWFwcHJvdmVfbm9ucHJvZml0AAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAA==",
        "AAAAAAAAACJSZXR1cm5zIHRoZSBwZW5kaW5nIGFkbWluLCBpZiBhbnkuAAAAAAARZ2V0X3BlbmRpbmdfYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAURSZWdpc3RlcnMgYSBuZXcgbm9ucHJvZml0IGluIGEgcGVuZGluZyBzdGF0ZS4KClRoZSBgc3RhdHVzYCBmaWVsZCBvZiB0aGUgaW5wdXQgaXMgaWdub3JlZCBhbmQgZm9yY2VkIHRvIGBQZW5kaW5nYC4KVGhpcyBwcmV2ZW50cyBhIGNhbGxlciBmcm9tIHJlZ2lzdGVyaW5nIHRoZW1zZWx2ZXMgYXMgYXBwcm92ZWQuCgojIEF1dGhvcml6YXRpb24KVGhlIGBub25wcm9maXRgIGFkZHJlc3MgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsLgoKIyBFcnJvcnMKKiBgTm9ucHJvZml0QWxyZWFkeVJlZ2lzdGVyZWRgIGlmIHRoZSBhZGRyZXNzIGFscmVhZHkgaGFzIGEgcHJvZmlsZS4AAAAScmVnaXN0ZXJfbm9ucHJvZml0AAAAAAACAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAAAAAAdwcm9maWxlAAAAB9AAAAAQTm9ucHJvZml0UHJvZmlsZQAAAAA=",
        "AAAABQAAADFFbWl0dGVkIHdoZW4gdGhlIHByb3Bvc2VkIGFkbWluIGFjY2VwdHMgdGhlIHJvbGUuAAAAAAAAAAAAAA1BZG1pbkFjY2VwdGVkAAAAAAAAAQAAAA5hZG1pbl9hY2NlcHRlZAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIGN1cnJlbnQgYWRtaW4gcHJvcG9zZXMgYSBzdWNjZXNzb3IuAAAAAAAAAA1BZG1pblByb3Bvc2VkAAAAAAAAAQAAAA5hZG1pbl9wcm9wb3NlZAAAAAAAAgAAAAAAAAAHY3VycmVudAAAAAATAAAAAAAAAAAAAAAIcHJvcG9zZWQAAAATAAAAAAAAAAI=",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJldm9rZXMgYSBwcmV2aW91c2x5IGFwcHJvdmVkIG5vbnByb2ZpdC4AAAAAAAAAABBOb25wcm9maXRSZXZva2VkAAAAAQAAABFub25wcm9maXRfcmV2b2tlZAAAAAAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAACxFbWl0dGVkIHdoZW4gdGhlIGFkbWluIGFwcHJvdmVzIGEgbm9ucHJvZml0LgAAAAAAAAARTm9ucHJvZml0QXBwcm92ZWQAAAAAAAABAAAAEm5vbnByb2ZpdF9hcHByb3ZlZAAAAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAEJFbWl0dGVkIHdoZW4gYSBub25wcm9maXQgcmVnaXN0ZXJzIGl0cyBwcm9maWxlIGluIGEgcGVuZGluZyBzdGF0ZS4AAAAAAAAAAAATTm9ucHJvZml0UmVnaXN0ZXJlZAAAAAABAAAAFG5vbnByb2ZpdF9yZWdpc3RlcmVkAAAAAgAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAEAAAAAAAAACmxlZ2FsX25hbWUAAAAAABAAAAAAAAAAAg==",
        "AAAABAAAAUVTaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKIyBTdGFiaWxpdHkgQ29udHJhY3QKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKiouIEV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsCmluZGV4ZXJzLCBtb25pdG9yaW5nIGRhc2hib2FyZHMsIGF1ZGl0IHJlcG9ydHMpIHJlbHkgb24gc3RhYmxlIG51bWVyaWMKZGlzY3JpbWluYW50cy4gR2FwcyBpbiB0aGUgc2VxdWVuY2UgaW5kaWNhdGUgcmVzZXJ2ZWQgY29kZXMuIE5ldyBjb2RlcwpNVVNUIGJlIGFwcGVuZGVkIGF0IHRoZSBlbmQuAAAAAAAAAAAAAAVFcnJvcgAAAAAAABoAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAADVVGhlIG1pbGVzdG9uZSBwZXJjZW50YWdlIGlzIG91dHNpZGUgdGhlIGFsbG93ZWQgcmFuZ2UKKGBNSU5fTUlMRVNUT05FX1BFUkNFTlRBR0UuLj1NQVhfTUlMRVNUT05FX1BFUkNFTlRBR0VgKS4KClRoZSB1cHBlciBib3VuZCAoOTAlKSBndWFyYW50ZWVzIHRoYXQgYXQgbGVhc3QgMTAlIG9mIHRoZSB0YXJnZXQKcmVtYWlucyB0aWVkIHRvIGV2aWRlbmNlIHZhbGlkYXRpb24uAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAAAAAABNOb3RBdXRob3JpemVkUm91dGVyAAAAABoAAABEUmVmdW5kIG5vdCBhdmFpbGFibGU6IGNhbXBhaWduIHN0aWxsIGFjdGl2ZSBvciBpbml0aWFsIHJlbGVhc2UgZG9uZS4AAAASUmVmdW5kTm90QXZhaWxhYmxlAAAAAAAbAAAAKFRoZSBkb25vciBoYXMgbm8gY29udHJpYnV0aW9uIHRvIHJlZnVuZC4AAAAPTm90aGluZ1RvUmVmdW5kAAAAABwAAAA1UHJvdmlkZWQgZXZpZGVuY2UgaGFzaCBkb2VzIG5vdCBtYXRjaCB0aGUgc3RvcmVkIG9uZS4AAAAAAAATSW52YWxpZEV2aWRlbmNlSGFzaAAAAAAdAAAAJkNhbGxlciBpcyBub3QgdGhlIGNvbmZpZ3VyZWQgdmVyaWZpZXIuAAAAAAALTm90VmVyaWZpZXIAAAAAHgAAACBDYWxsZXIgaXMgbm90IHRoZSBwZW5kaW5nIGFkbWluLgAAAA9Ob3RQZW5kaW5nQWRtaW4AAAAAHwAAACpUaGUgdmF1bHQgaXMgcGF1c2VkOyBkZXBvc2l0cyBhcmUgYmxvY2tlZC4AAAAAAAtWYXVsdFBhdXNlZAAAAAAg",
        "AAAAAgAAAEFMaWZlY3ljbGUgc3RhdGVzIG9mIGEgbm9ucHJvZml0IG9yZ2FuaXphdGlvbiB3aXRoaW4gdGhlIHJlZ2lzdHJ5LgAAAAAAAAAAAAAPTm9ucHJvZml0U3RhdHVzAAAAAAMAAAAAAAAALVJlZ2lzdGVyZWQgYnV0IG5vdCB5ZXQgYXBwcm92ZWQgYnkgdGhlIGFkbWluLgAAAAAAAAdQZW5kaW5nAAAAAAAAAAA5QXBwcm92ZWQgYnkgdGhlIGFkbWluIGFuZCBhdXRob3JpemVkIHRvIGNyZWF0ZSBjYW1wYWlnbnMuAAAAAAAACEFwcHJvdmVkAAAAAAAAAC5BcHByb3ZhbCByZXZva2VkOyBjYW5ub3QgY3JlYXRlIG5ldyBjYW1wYWlnbnMuAAAAAAAHUmV2b2tlZAA=",
        "AAAAAQAAARVWZXJpZmllZCBpZGVudGl0eSBhbmQgbGVnYWwgcHJvZmlsZSBvZiBhIG5vbnByb2ZpdCBvcmdhbml6YXRpb24uCgojIFByaXZhY3kKUGVyc29uYWwgZGF0YSAoZW1haWwsIFJVVCkgaXMgc3RvcmVkIG9mZi1jaGFpbi4gT24tY2hhaW4gd2Uga2VlcCBvbmx5CmNyeXB0b2dyYXBoaWMgaGFzaGVzIHNvIHRoZSBwcm9maWxlIGlzIHZlcmlmaWFibGUgd2l0aG91dCBleHBvc2luZyBQSUkuClRoaXMgYWxpZ25zIHdpdGggQ29sb21iaWEncyBMZXkgMTU4MSBkZSAyMDEyIChIYWJlYXMgRGF0YSkuAAAAAAAAAAAAABBOb25wcm9maXRQcm9maWxlAAAABwAAAERXaGV0aGVyIHRoZSBvcmdhbml6YXRpb24gY29uc2VudGVkIHRvIGRhdGEgcHJvY2Vzc2luZyAoSGFiZWFzIERhdGEpLgAAAAxkYXRhX2NvbnNlbnQAAAABAAAAM1NIQS0yNTYgaGFzaCBvZiB0aGUgY29udGFjdCBlbWFpbCBzdG9yZWQgb2ZmLWNoYWluLgAAAAAKZW1haWxfaGFzaAAAAAAADgAAAB9MZWdhbCBuYW1lIG9mIHRoZSBvcmdhbml6YXRpb24uAAAAAApsZWdhbF9uYW1lAAAAAAAQAAAAQ1doZXRoZXIgdGhlIG9yZ2FuaXphdGlvbiBob2xkcyBhIHNwZWNpYWwgdGF4IHJldGVudGlvbiBjZXJ0aWZpY2F0ZS4AAAAAFXJldGVudGlvbl9jZXJ0aWZpY2F0ZQAAAAAAAAEAAAAyU0hBLTI1NiBoYXNoIG9mIHRoZSBSVVQgZG9jdW1lbnQgc3RvcmVkIG9mZi1jaGFpbi4AAAAAAAhydXRfaGFzaAAAAA4AAAAXQ3VycmVudCBhcHByb3ZhbCBzdGF0ZS4AAAAABnN0YXR1cwAAAAAH0AAAAA9Ob25wcm9maXRTdGF0dXMAAAAAPlRheCBpZGVudGlmaWNhdGlvbiBudW1iZXIgKE5JVCBpbiBDb2xvbWJpYSkuIFB1YmxpYyBieSBuYXR1cmUuAAAAAAAGdGF4X2lkAAAAAAAQ" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_admin: this.txFromJSON<string>,
        get_profile: this.txFromJSON<NonprofitProfile>,
        is_approved: this.txFromJSON<boolean>,
        accept_admin: this.txFromJSON<null>,
        propose_admin: this.txFromJSON<null>,
        revoke_nonprofit: this.txFromJSON<null>,
        approve_nonprofit: this.txFromJSON<null>,
        get_pending_admin: this.txFromJSON<Option<string>>,
        register_nonprofit: this.txFromJSON<null>
  }
}