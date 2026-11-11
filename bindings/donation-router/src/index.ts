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
 * Result of a fee quote, returned by `quote`.
 */
export interface QuoteResult {
  fee_amount: i128;
  gross_amount: i128;
  net_amount: i128;
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

export interface Client {
  /**
   * Construct and simulate a quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the fee breakdown for a given gross amount without executing
   * a donation. Useful for UI previews.
   * 
   * # Arguments
   * * `gross_amount` - The gross amount the donor is considering.
   * 
   * # Returns
   * A `QuoteResult` with `gross_amount`, `fee_amount`, and `net_amount`.
   */
  quote: ({gross_amount}: {gross_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<QuoteResult>>

  /**
   * Construct and simulate a donate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Routes a donation through the platform in a single atomic transaction.
   * 
   * # Atomicity
   * The fee transfer and the vault deposit happen in the same
   * transaction. If either fails, the entire transaction reverts
   * (Soroban protocol-level atomicity). The donor is never partially
   * charged.
   * 
   * # Flow
   * 1. Compute `fee_amount = gross * fee_bps / 10_000` and
   * `net_amount = gross - fee_amount`.
   * 2. If `fee_amount > 0`, read the vault state to get the token, then
   * transfer the fee from `donor` to `treasury`. If the fee is zero,
   * skip the read (optimization for the current deployment where
   * `fee_bps = 0`).
   * 3. Call `vault.deposit(campaign_id, donor, net_amount)`. The vault
   * validates the campaign, transfers the net amount, and releases
   * the initial milestone if the target is reached.
   * 
   * # Authorization
   * * `donor` must authorize this call.
   * * If the vault has `authorized_router` configured, this router must
   * be that address (it is, by definition).
   * 
   * # Errors
   * * `InvalidAmount` if `amount <= 0`.
   * * Vault errors propagate unchanged: `CampaignNotFound`
   */
  donate: ({campaign_id, donor, amount}: {campaign_id: u64, donor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current admin.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current fee in basis points.
   */
  get_fee_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
   * Construct and simulate a get_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current treasury address.
   */
  get_treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Proposes a new admin. Must be accepted by the proposed admin.
   * 
   * # Authorization
   * Only the current admin can propose.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the current admin.
   */
  propose_admin: ({admin, new_admin}: {admin: string, new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the platform fee.
   * 
   * # Authorization
   * Only the admin can update the fee.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the admin.
   * * `InvalidFeeBps` if `new_fee_bps > MAX_FEE_BPS`.
   */
  update_fee_bps: ({admin, new_fee_bps}: {admin: string, new_fee_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the treasury address.
   * 
   * # Authorization
   * Only the admin can update the treasury.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the admin.
   */
  update_treasury: ({admin, new_treasury}: {admin: string, new_treasury: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the pending admin, if any.
   */
  get_pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_campaign_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the Campaign Vault address.
   */
  get_campaign_vault: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, treasury, campaign_vault, fee_bps}: {admin: string, treasury: string, campaign_vault: string, fee_bps: u32},
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
    return ContractClient.deploy({admin, treasury, campaign_vault, fee_bps}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAACtSZXN1bHQgb2YgYSBmZWUgcXVvdGUsIHJldHVybmVkIGJ5IGBxdW90ZWAuAAAAAAAAAAALUXVvdGVSZXN1bHQAAAAAAwAAAAAAAAAKZmVlX2Ftb3VudAAAAAAACwAAAAAAAAAMZ3Jvc3NfYW1vdW50AAAACwAAAAAAAAAKbmV0X2Ftb3VudAAAAAAACw==",
        "AAAAAAAAAQNSZXR1cm5zIHRoZSBmZWUgYnJlYWtkb3duIGZvciBhIGdpdmVuIGdyb3NzIGFtb3VudCB3aXRob3V0IGV4ZWN1dGluZwphIGRvbmF0aW9uLiBVc2VmdWwgZm9yIFVJIHByZXZpZXdzLgoKIyBBcmd1bWVudHMKKiBgZ3Jvc3NfYW1vdW50YCAtIFRoZSBncm9zcyBhbW91bnQgdGhlIGRvbm9yIGlzIGNvbnNpZGVyaW5nLgoKIyBSZXR1cm5zCkEgYFF1b3RlUmVzdWx0YCB3aXRoIGBncm9zc19hbW91bnRgLCBgZmVlX2Ftb3VudGAsIGFuZCBgbmV0X2Ftb3VudGAuAAAAAAVxdW90ZQAAAAAAAAEAAAAAAAAADGdyb3NzX2Ftb3VudAAAAAsAAAABAAAH0AAAAAtRdW90ZVJlc3VsdAA=",
        "AAAAAAAABABSb3V0ZXMgYSBkb25hdGlvbiB0aHJvdWdoIHRoZSBwbGF0Zm9ybSBpbiBhIHNpbmdsZSBhdG9taWMgdHJhbnNhY3Rpb24uCgojIEF0b21pY2l0eQpUaGUgZmVlIHRyYW5zZmVyIGFuZCB0aGUgdmF1bHQgZGVwb3NpdCBoYXBwZW4gaW4gdGhlIHNhbWUKdHJhbnNhY3Rpb24uIElmIGVpdGhlciBmYWlscywgdGhlIGVudGlyZSB0cmFuc2FjdGlvbiByZXZlcnRzCihTb3JvYmFuIHByb3RvY29sLWxldmVsIGF0b21pY2l0eSkuIFRoZSBkb25vciBpcyBuZXZlciBwYXJ0aWFsbHkKY2hhcmdlZC4KCiMgRmxvdwoxLiBDb21wdXRlIGBmZWVfYW1vdW50ID0gZ3Jvc3MgKiBmZWVfYnBzIC8gMTBfMDAwYCBhbmQKYG5ldF9hbW91bnQgPSBncm9zcyAtIGZlZV9hbW91bnRgLgoyLiBJZiBgZmVlX2Ftb3VudCA+IDBgLCByZWFkIHRoZSB2YXVsdCBzdGF0ZSB0byBnZXQgdGhlIHRva2VuLCB0aGVuCnRyYW5zZmVyIHRoZSBmZWUgZnJvbSBgZG9ub3JgIHRvIGB0cmVhc3VyeWAuIElmIHRoZSBmZWUgaXMgemVybywKc2tpcCB0aGUgcmVhZCAob3B0aW1pemF0aW9uIGZvciB0aGUgY3VycmVudCBkZXBsb3ltZW50IHdoZXJlCmBmZWVfYnBzID0gMGApLgozLiBDYWxsIGB2YXVsdC5kZXBvc2l0KGNhbXBhaWduX2lkLCBkb25vciwgbmV0X2Ftb3VudClgLiBUaGUgdmF1bHQKdmFsaWRhdGVzIHRoZSBjYW1wYWlnbiwgdHJhbnNmZXJzIHRoZSBuZXQgYW1vdW50LCBhbmQgcmVsZWFzZXMKdGhlIGluaXRpYWwgbWlsZXN0b25lIGlmIHRoZSB0YXJnZXQgaXMgcmVhY2hlZC4KCiMgQXV0aG9yaXphdGlvbgoqIGBkb25vcmAgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsLgoqIElmIHRoZSB2YXVsdCBoYXMgYGF1dGhvcml6ZWRfcm91dGVyYCBjb25maWd1cmVkLCB0aGlzIHJvdXRlciBtdXN0CmJlIHRoYXQgYWRkcmVzcyAoaXQgaXMsIGJ5IGRlZmluaXRpb24pLgoKIyBFcnJvcnMKKiBgSW52YWxpZEFtb3VudGAgaWYgYGFtb3VudCA8PSAwYC4KKiBWYXVsdCBlcnJvcnMgcHJvcGFnYXRlIHVuY2hhbmdlZDogYENhbXBhaWduTm90Rm91bmRgAAAABmRvbmF0ZQAAAAAAAwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAABpSZXR1cm5zIHRoZSBjdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAChSZXR1cm5zIHRoZSBjdXJyZW50IGZlZSBpbiBiYXNpcyBwb2ludHMuAAAAC2dldF9mZWVfYnBzAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAIxBY2NlcHRzIHRoZSBwZW5kaW5nIGFkbWluIHJvbGUuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgcGVuZGluZyBhZG1pbiBjYW4gYWNjZXB0LgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGVyZSBpcyBubyBwZW5kaW5nIGFkbWluLgAAAAxhY2NlcHRfYWRtaW4AAAAAAAAAAA==",
        "AAAAAAAAACVSZXR1cm5zIHRoZSBjdXJyZW50IHRyZWFzdXJ5IGFkZHJlc3MuAAAAAAAADGdldF90cmVhc3VyeQAAAAAAAAABAAAAEw==",
        "AAAAAAAAAddJbml0aWFsaXplcyB0aGUgcm91dGVyIHdpdGggYWRtaW4sIHRyZWFzdXJ5LCB2YXVsdCwgYW5kIGZlZS4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIEFkZHJlc3MgYXV0aG9yaXplZCB0byBjb25maWd1cmUgdGhlIHJvdXRlci4gQ2FuIGJlIGFuCkVPQSBvciBhIGBnb3Zlcm5hbmNlLWFjY291bnRgLgoqIGB0cmVhc3VyeWAgLSBBZGRyZXNzIHRoYXQgcmVjZWl2ZXMgcGxhdGZvcm0gZmVlcy4KKiBgY2FtcGFpZ25fdmF1bHRgIC0gQWRkcmVzcyBvZiB0aGUgQ2FtcGFpZ24gVmF1bHQgY29udHJhY3QuCiogYGZlZV9icHNgIC0gSW5pdGlhbCBmZWUgaW4gYmFzaXMgcG9pbnRzLiBNdXN0IGJlIGA8PSBNQVhfRkVFX0JQU2AuCgojIEVycm9ycwoqIGBVbmF1dGhvcml6ZWRgIGlmIHRoZSBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIGluaXRpYWxpemVkLgoqIGBJbnZhbGlkRmVlQnBzYCBpZiBgZmVlX2JwcyA+IE1BWF9GRUVfQlBTYC4AAAAADV9fY29uc3RydWN0b3IAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAOY2FtcGFpZ25fdmF1bHQAAAAAABMAAAAAAAAAB2ZlZV9icHMAAAAABAAAAAA=",
        "AAAAAAAAALVQcm9wb3NlcyBhIG5ldyBhZG1pbi4gTXVzdCBiZSBhY2NlcHRlZCBieSB0aGUgcHJvcG9zZWQgYWRtaW4uCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgY3VycmVudCBhZG1pbiBjYW4gcHJvcG9zZS4KCiMgRXJyb3JzCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNhbGxlciBpcyBub3QgdGhlIGN1cnJlbnQgYWRtaW4uAAAAAAAADXByb3Bvc2VfYWRtaW4AAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAALpVcGRhdGVzIHRoZSBwbGF0Zm9ybSBmZWUuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgYWRtaW4gY2FuIHVwZGF0ZSB0aGUgZmVlLgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4uCiogYEludmFsaWRGZWVCcHNgIGlmIGBuZXdfZmVlX2JwcyA+IE1BWF9GRUVfQlBTYC4AAAAAAA51cGRhdGVfZmVlX2JwcwAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtuZXdfZmVlX2JwcwAAAAAEAAAAAA==",
        "AAAAAAAAAJFVcGRhdGVzIHRoZSB0cmVhc3VyeSBhZGRyZXNzLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIGFkbWluIGNhbiB1cGRhdGUgdGhlIHRyZWFzdXJ5LgoKIyBFcnJvcnMKKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4uAAAAAAAAD3VwZGF0ZV90cmVhc3VyeQAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADG5ld190cmVhc3VyeQAAABMAAAAA",
        "AAAAAAAAACJSZXR1cm5zIHRoZSBwZW5kaW5nIGFkbWluLCBpZiBhbnkuAAAAAAARZ2V0X3BlbmRpbmdfYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAACNSZXR1cm5zIHRoZSBDYW1wYWlnbiBWYXVsdCBhZGRyZXNzLgAAAAASZ2V0X2NhbXBhaWduX3ZhdWx0AAAAAAAAAAAAAQAAABM=",
        "AAAABQAAADFFbWl0dGVkIHdoZW4gdGhlIHByb3Bvc2VkIGFkbWluIGFjY2VwdHMgdGhlIHJvbGUuAAAAAAAAAAAAAA1BZG1pbkFjY2VwdGVkAAAAAAAAAQAAAA5hZG1pbl9hY2NlcHRlZAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIGN1cnJlbnQgYWRtaW4gcHJvcG9zZXMgYSBzdWNjZXNzb3IuAAAAAAAAAA1BZG1pblByb3Bvc2VkAAAAAAAAAQAAAA5hZG1pbl9wcm9wb3NlZAAAAAAAAgAAAAAAAAAHY3VycmVudAAAAAATAAAAAAAAAAAAAAAIcHJvcG9zZWQAAAATAAAAAAAAAAI=",
        "AAAABQAAAClFbWl0dGVkIHdoZW4gdGhlIHBsYXRmb3JtIGZlZSBpcyB1cGRhdGVkLgAAAAAAAAAAAAANRmVlQnBzVXBkYXRlZAAAAAAAAAEAAAAPZmVlX2Jwc191cGRhdGVkAAAAAAIAAAAAAAAAC29sZF9mZWVfYnBzAAAAAAQAAAAAAAAAAAAAAAtuZXdfZmVlX2JwcwAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAEJFbWl0dGVkIG9uIGV2ZXJ5IHN1Y2Nlc3NmdWwgZG9uYXRpb24gcm91dGVkIHRocm91Z2ggdGhpcyBjb250cmFjdC4AAAAAAAAAAAAORG9uYXRpb25Sb3V0ZWQAAAAAAAEAAAAPZG9uYXRpb25fcm91dGVkAAAAAAUAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAAAAAAAAVkb25vcgAAAAAAABMAAAAAAAAAAAAAAAxncm9zc19hbW91bnQAAAALAAAAAAAAAAAAAAAKZmVlX2Ftb3VudAAAAAAACwAAAAAAAAAAAAAACm5ldF9hbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAC1FbWl0dGVkIHdoZW4gdGhlIHRyZWFzdXJ5IGFkZHJlc3MgaXMgdXBkYXRlZC4AAAAAAAAAAAAAD1RyZWFzdXJ5VXBkYXRlZAAAAAABAAAAEHRyZWFzdXJ5X3VwZGF0ZWQAAAACAAAAAAAAAAxvbGRfdHJlYXN1cnkAAAATAAAAAAAAAAAAAAAMbmV3X3RyZWFzdXJ5AAAAEwAAAAAAAAAC",
        "AAAABAAAAUVTaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKIyBTdGFiaWxpdHkgQ29udHJhY3QKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKiouIEV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsCmluZGV4ZXJzLCBtb25pdG9yaW5nIGRhc2hib2FyZHMsIGF1ZGl0IHJlcG9ydHMpIHJlbHkgb24gc3RhYmxlIG51bWVyaWMKZGlzY3JpbWluYW50cy4gR2FwcyBpbiB0aGUgc2VxdWVuY2UgaW5kaWNhdGUgcmVzZXJ2ZWQgY29kZXMuIE5ldyBjb2RlcwpNVVNUIGJlIGFwcGVuZGVkIGF0IHRoZSBlbmQuAAAAAAAAAAAAAAVFcnJvcgAAAAAAABoAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAADVVGhlIG1pbGVzdG9uZSBwZXJjZW50YWdlIGlzIG91dHNpZGUgdGhlIGFsbG93ZWQgcmFuZ2UKKGBNSU5fTUlMRVNUT05FX1BFUkNFTlRBR0UuLj1NQVhfTUlMRVNUT05FX1BFUkNFTlRBR0VgKS4KClRoZSB1cHBlciBib3VuZCAoOTAlKSBndWFyYW50ZWVzIHRoYXQgYXQgbGVhc3QgMTAlIG9mIHRoZSB0YXJnZXQKcmVtYWlucyB0aWVkIHRvIGV2aWRlbmNlIHZhbGlkYXRpb24uAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAAAAAABNOb3RBdXRob3JpemVkUm91dGVyAAAAABoAAABEUmVmdW5kIG5vdCBhdmFpbGFibGU6IGNhbXBhaWduIHN0aWxsIGFjdGl2ZSBvciBpbml0aWFsIHJlbGVhc2UgZG9uZS4AAAASUmVmdW5kTm90QXZhaWxhYmxlAAAAAAAbAAAAKFRoZSBkb25vciBoYXMgbm8gY29udHJpYnV0aW9uIHRvIHJlZnVuZC4AAAAPTm90aGluZ1RvUmVmdW5kAAAAABwAAAA1UHJvdmlkZWQgZXZpZGVuY2UgaGFzaCBkb2VzIG5vdCBtYXRjaCB0aGUgc3RvcmVkIG9uZS4AAAAAAAATSW52YWxpZEV2aWRlbmNlSGFzaAAAAAAdAAAAJkNhbGxlciBpcyBub3QgdGhlIGNvbmZpZ3VyZWQgdmVyaWZpZXIuAAAAAAALTm90VmVyaWZpZXIAAAAAHgAAACBDYWxsZXIgaXMgbm90IHRoZSBwZW5kaW5nIGFkbWluLgAAAA9Ob3RQZW5kaW5nQWRtaW4AAAAAHwAAACpUaGUgdmF1bHQgaXMgcGF1c2VkOyBkZXBvc2l0cyBhcmUgYmxvY2tlZC4AAAAAAAtWYXVsdFBhdXNlZAAAAAAg" ]),
      options
    )
  }
  public readonly fromJSON = {
    quote: this.txFromJSON<QuoteResult>,
        donate: this.txFromJSON<null>,
        get_admin: this.txFromJSON<string>,
        get_fee_bps: this.txFromJSON<u32>,
        accept_admin: this.txFromJSON<null>,
        get_treasury: this.txFromJSON<string>,
        propose_admin: this.txFromJSON<null>,
        update_fee_bps: this.txFromJSON<null>,
        update_treasury: this.txFromJSON<null>,
        get_pending_admin: this.txFromJSON<Option<string>>,
        get_campaign_vault: this.txFromJSON<string>
  }
}