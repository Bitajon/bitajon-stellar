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
 * Metadata and financial goal of a fundraising campaign.
 */
export interface Campaign {
  /**
 * Unix timestamp after which the campaign no longer accepts deposits.
 */
deadline: u64;
  /**
 * Description of the campaign's purpose.
 */
description: string;
  /**
 * Geographic location where the campaign operates.
 */
location: string;
  /**
 * Percentage of `target_amount` released upon reaching the goal.
 * 
 * Must be in `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE`
 * (currently `1..=90`). The upper bound guarantees that at least 10% of
 * the target remains tied to evidence validation, preserving the
 * "Payment by Progress" accountability model.
 */
milestone_percentage: u32;
  /**
 * Human-readable campaign name.
 */
name: string;
  /**
 * Address of the nonprofit that owns the campaign.
 */
nonprofit: string;
  /**
 * Current lifecycle state.
 */
status: CampaignStatus;
  /**
 * Funding goal in the smallest unit of `token_address`.
 * 
 * **Important**: This amount is expressed in NET terms (what the vault
 * must accumulate after platform fees). The frontend is responsible for
 * computing the gross amount the donor must pay.
 */
target_amount: i128;
  /**
 * SEP-41 token used for donations (USDC, EURC, or any SAC).
 */
token_address: string;
}

/**
 * Lifecycle states of a fundraising campaign.
 */
export type CampaignStatus = {tag: "Active", values: void} | {tag: "Completed", values: void} | {tag: "Cancelled", values: void};

export interface Client {
  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current admin.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts the pending admin role.
   * 
   * # Authorization
   * Only the pending admin can accept.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the metadata of a specific campaign.
   * 
   * # Errors
   * * `CampaignNotFound` if the ID does not exist.
   */
  get_campaign: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Campaign>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Proposes a new admin. The proposal must be accepted by the new admin.
   * 
   * # Authorization
   * Only the current admin can propose.
   */
  propose_admin: ({admin, new_admin}: {admin: string, new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancels an active campaign owned by the caller.
   * 
   * # Note
   * Cancellation flips the campaign status to `Cancelled`. Existing vaults
   * become eligible for pull-based refunds (see `campaign-vault.claim_refund`).
   * 
   * # Authorization
   * Only the nonprofit that owns the campaign can cancel it.
   * 
   * # Errors
   * * `CampaignNotFound` if the campaign does not exist.
   * * `Unauthorized` if the caller is not the owning nonprofit.
   * * `CampaignNotActive` if the campaign is not in `Active` status.
   */
  cancel_campaign: ({nonprofit, campaign_id}: {nonprofit: string, campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a new campaign owned by an approved nonprofit.
   * 
   * # Validation
   * * `target_amount` must be strictly positive.
   * * `deadline` must be in the future.
   * * `milestone_percentage` must be in
   * `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE` (1..=90).
   * No default fallback: the caller must choose explicitly.
   * * `token_address` must be a valid SEP-41 token (verified via `decimals()`).
   * * `nonprofit` must be approved in the Nonprofit Registry.
   * 
   * # Authorization
   * The `nonprofit` address must authorize this call.
   * 
   * # Returns
   * The newly assigned `campaign_id`.
   */
  create_campaign: ({nonprofit, name, description, location, target_amount, token_address, deadline, milestone_percentage}: {nonprofit: string, name: string, description: string, location: string, target_amount: i128, token_address: string, deadline: u64, milestone_percentage: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the pending admin, if any.
   */
  get_pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, nonprofit_registry}: {admin: string, nonprofit_registry: string},
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
    return ContractClient.deploy({admin, nonprofit_registry}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAABpSZXR1cm5zIHRoZSBjdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAFNBY2NlcHRzIHRoZSBwZW5kaW5nIGFkbWluIHJvbGUuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgcGVuZGluZyBhZG1pbiBjYW4gYWNjZXB0LgAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAAGVSZXR1cm5zIHRoZSBtZXRhZGF0YSBvZiBhIHNwZWNpZmljIGNhbXBhaWduLgoKIyBFcnJvcnMKKiBgQ2FtcGFpZ25Ob3RGb3VuZGAgaWYgdGhlIElEIGRvZXMgbm90IGV4aXN0LgAAAAAAAAxnZXRfY2FtcGFpZ24AAAABAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAB9AAAAAIQ2FtcGFpZ24=",
        "AAAAAAAAAQdJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbiBhbmQgdGhlIE5vbnByb2ZpdCBSZWdpc3RyeSBhZGRyZXNzLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gQWRkcmVzcyBhdXRob3JpemVkIHRvIG1hbmFnZSB0aGUgcmVnaXN0cnkuIENhbiBiZSBhbiBFT0EKKGBHLi4uYCkgb3IgYSBzbWFydCBhY2NvdW50IChgQy4uLmApLgoqIGBub25wcm9maXRfcmVnaXN0cnlgIC0gQWRkcmVzcyBvZiB0aGUgZGVwbG95ZWQgTm9ucHJvZml0IFJlZ2lzdHJ5LgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAASbm9ucHJvZml0X3JlZ2lzdHJ5AAAAAAATAAAAAA==",
        "AAAAAAAAAHpQcm9wb3NlcyBhIG5ldyBhZG1pbi4gVGhlIHByb3Bvc2FsIG11c3QgYmUgYWNjZXB0ZWQgYnkgdGhlIG5ldyBhZG1pbi4KCiMgQXV0aG9yaXphdGlvbgpPbmx5IHRoZSBjdXJyZW50IGFkbWluIGNhbiBwcm9wb3NlLgAAAAAADXByb3Bvc2VfYWRtaW4AAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAdBDYW5jZWxzIGFuIGFjdGl2ZSBjYW1wYWlnbiBvd25lZCBieSB0aGUgY2FsbGVyLgoKIyBOb3RlCkNhbmNlbGxhdGlvbiBmbGlwcyB0aGUgY2FtcGFpZ24gc3RhdHVzIHRvIGBDYW5jZWxsZWRgLiBFeGlzdGluZyB2YXVsdHMKYmVjb21lIGVsaWdpYmxlIGZvciBwdWxsLWJhc2VkIHJlZnVuZHMgKHNlZSBgY2FtcGFpZ24tdmF1bHQuY2xhaW1fcmVmdW5kYCkuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgbm9ucHJvZml0IHRoYXQgb3ducyB0aGUgY2FtcGFpZ24gY2FuIGNhbmNlbCBpdC4KCiMgRXJyb3JzCiogYENhbXBhaWduTm90Rm91bmRgIGlmIHRoZSBjYW1wYWlnbiBkb2VzIG5vdCBleGlzdC4KKiBgVW5hdXRob3JpemVkYCBpZiB0aGUgY2FsbGVyIGlzIG5vdCB0aGUgb3duaW5nIG5vbnByb2ZpdC4KKiBgQ2FtcGFpZ25Ob3RBY3RpdmVgIGlmIHRoZSBjYW1wYWlnbiBpcyBub3QgaW4gYEFjdGl2ZWAgc3RhdHVzLgAAAA9jYW5jZWxfY2FtcGFpZ24AAAAAAgAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAA=",
        "AAAAAAAAAidDcmVhdGVzIGEgbmV3IGNhbXBhaWduIG93bmVkIGJ5IGFuIGFwcHJvdmVkIG5vbnByb2ZpdC4KCiMgVmFsaWRhdGlvbgoqIGB0YXJnZXRfYW1vdW50YCBtdXN0IGJlIHN0cmljdGx5IHBvc2l0aXZlLgoqIGBkZWFkbGluZWAgbXVzdCBiZSBpbiB0aGUgZnV0dXJlLgoqIGBtaWxlc3RvbmVfcGVyY2VudGFnZWAgbXVzdCBiZSBpbgpgTUlOX01JTEVTVE9ORV9QRVJDRU5UQUdFLi49TUFYX01JTEVTVE9ORV9QRVJDRU5UQUdFYCAoMS4uPTkwKS4KTm8gZGVmYXVsdCBmYWxsYmFjazogdGhlIGNhbGxlciBtdXN0IGNob29zZSBleHBsaWNpdGx5LgoqIGB0b2tlbl9hZGRyZXNzYCBtdXN0IGJlIGEgdmFsaWQgU0VQLTQxIHRva2VuICh2ZXJpZmllZCB2aWEgYGRlY2ltYWxzKClgKS4KKiBgbm9ucHJvZml0YCBtdXN0IGJlIGFwcHJvdmVkIGluIHRoZSBOb25wcm9maXQgUmVnaXN0cnkuCgojIEF1dGhvcml6YXRpb24KVGhlIGBub25wcm9maXRgIGFkZHJlc3MgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsLgoKIyBSZXR1cm5zClRoZSBuZXdseSBhc3NpZ25lZCBgY2FtcGFpZ25faWRgLgAAAAAPY3JlYXRlX2NhbXBhaWduAAAAAAgAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAhsb2NhdGlvbgAAABAAAAAAAAAADXRhcmdldF9hbW91bnQAAAAAAAALAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAABRtaWxlc3RvbmVfcGVyY2VudGFnZQAAAAQAAAABAAAABg==",
        "AAAAAAAAACJSZXR1cm5zIHRoZSBwZW5kaW5nIGFkbWluLCBpZiBhbnkuAAAAAAARZ2V0X3BlbmRpbmdfYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAABQAAADFFbWl0dGVkIHdoZW4gdGhlIHByb3Bvc2VkIGFkbWluIGFjY2VwdHMgdGhlIHJvbGUuAAAAAAAAAAAAAA1BZG1pbkFjY2VwdGVkAAAAAAAAAQAAAA5hZG1pbl9hY2NlcHRlZAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIGN1cnJlbnQgYWRtaW4gcHJvcG9zZXMgYSBzdWNjZXNzb3IuAAAAAAAAAA1BZG1pblByb3Bvc2VkAAAAAAAAAQAAAA5hZG1pbl9wcm9wb3NlZAAAAAAAAgAAAAAAAAAHY3VycmVudAAAAAATAAAAAAAAAAAAAAAIcHJvcG9zZWQAAAATAAAAAAAAAAI=",
        "AAAABQAAACdFbWl0dGVkIHdoZW4gYSBuZXcgY2FtcGFpZ24gaXMgY3JlYXRlZC4AAAAAAAAAAA9DYW1wYWlnbkNyZWF0ZWQAAAAAAQAAABBjYW1wYWlnbl9jcmVhdGVkAAAABAAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAAAAAADXRhcmdldF9hbW91bnQAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gYSBjYW1wYWlnbiBpcyBjYW5jZWxsZWQgYnkgaXRzIG5vbnByb2ZpdC4AAAAAAAAAAAARQ2FtcGFpZ25DYW5jZWxsZWQAAAAAAAABAAAAEmNhbXBhaWduX2NhbmNlbGxlZAAAAAAAAgAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAAAg==",
        "AAAABAAAAUVTaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKIyBTdGFiaWxpdHkgQ29udHJhY3QKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKiouIEV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsCmluZGV4ZXJzLCBtb25pdG9yaW5nIGRhc2hib2FyZHMsIGF1ZGl0IHJlcG9ydHMpIHJlbHkgb24gc3RhYmxlIG51bWVyaWMKZGlzY3JpbWluYW50cy4gR2FwcyBpbiB0aGUgc2VxdWVuY2UgaW5kaWNhdGUgcmVzZXJ2ZWQgY29kZXMuIE5ldyBjb2RlcwpNVVNUIGJlIGFwcGVuZGVkIGF0IHRoZSBlbmQuAAAAAAAAAAAAAAVFcnJvcgAAAAAAABoAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAADVVGhlIG1pbGVzdG9uZSBwZXJjZW50YWdlIGlzIG91dHNpZGUgdGhlIGFsbG93ZWQgcmFuZ2UKKGBNSU5fTUlMRVNUT05FX1BFUkNFTlRBR0UuLj1NQVhfTUlMRVNUT05FX1BFUkNFTlRBR0VgKS4KClRoZSB1cHBlciBib3VuZCAoOTAlKSBndWFyYW50ZWVzIHRoYXQgYXQgbGVhc3QgMTAlIG9mIHRoZSB0YXJnZXQKcmVtYWlucyB0aWVkIHRvIGV2aWRlbmNlIHZhbGlkYXRpb24uAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAAAAAABNOb3RBdXRob3JpemVkUm91dGVyAAAAABoAAABEUmVmdW5kIG5vdCBhdmFpbGFibGU6IGNhbXBhaWduIHN0aWxsIGFjdGl2ZSBvciBpbml0aWFsIHJlbGVhc2UgZG9uZS4AAAASUmVmdW5kTm90QXZhaWxhYmxlAAAAAAAbAAAAKFRoZSBkb25vciBoYXMgbm8gY29udHJpYnV0aW9uIHRvIHJlZnVuZC4AAAAPTm90aGluZ1RvUmVmdW5kAAAAABwAAAA1UHJvdmlkZWQgZXZpZGVuY2UgaGFzaCBkb2VzIG5vdCBtYXRjaCB0aGUgc3RvcmVkIG9uZS4AAAAAAAATSW52YWxpZEV2aWRlbmNlSGFzaAAAAAAdAAAAJkNhbGxlciBpcyBub3QgdGhlIGNvbmZpZ3VyZWQgdmVyaWZpZXIuAAAAAAALTm90VmVyaWZpZXIAAAAAHgAAACBDYWxsZXIgaXMgbm90IHRoZSBwZW5kaW5nIGFkbWluLgAAAA9Ob3RQZW5kaW5nQWRtaW4AAAAAHwAAACpUaGUgdmF1bHQgaXMgcGF1c2VkOyBkZXBvc2l0cyBhcmUgYmxvY2tlZC4AAAAAAAtWYXVsdFBhdXNlZAAAAAAg",
        "AAAAAQAAADZNZXRhZGF0YSBhbmQgZmluYW5jaWFsIGdvYWwgb2YgYSBmdW5kcmFpc2luZyBjYW1wYWlnbi4AAAAAAAAAAAAIQ2FtcGFpZ24AAAAJAAAAQ1VuaXggdGltZXN0YW1wIGFmdGVyIHdoaWNoIHRoZSBjYW1wYWlnbiBubyBsb25nZXIgYWNjZXB0cyBkZXBvc2l0cy4AAAAACGRlYWRsaW5lAAAABgAAACZEZXNjcmlwdGlvbiBvZiB0aGUgY2FtcGFpZ24ncyBwdXJwb3NlLgAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAwR2VvZ3JhcGhpYyBsb2NhdGlvbiB3aGVyZSB0aGUgY2FtcGFpZ24gb3BlcmF0ZXMuAAAACGxvY2F0aW9uAAAAEAAAATFQZXJjZW50YWdlIG9mIGB0YXJnZXRfYW1vdW50YCByZWxlYXNlZCB1cG9uIHJlYWNoaW5nIHRoZSBnb2FsLgoKTXVzdCBiZSBpbiBgTUlOX01JTEVTVE9ORV9QRVJDRU5UQUdFLi49TUFYX01JTEVTVE9ORV9QRVJDRU5UQUdFYAooY3VycmVudGx5IGAxLi49OTBgKS4gVGhlIHVwcGVyIGJvdW5kIGd1YXJhbnRlZXMgdGhhdCBhdCBsZWFzdCAxMCUgb2YKdGhlIHRhcmdldCByZW1haW5zIHRpZWQgdG8gZXZpZGVuY2UgdmFsaWRhdGlvbiwgcHJlc2VydmluZyB0aGUKIlBheW1lbnQgYnkgUHJvZ3Jlc3MiIGFjY291bnRhYmlsaXR5IG1vZGVsLgAAAAAAABRtaWxlc3RvbmVfcGVyY2VudGFnZQAAAAQAAAAdSHVtYW4tcmVhZGFibGUgY2FtcGFpZ24gbmFtZS4AAAAAAAAEbmFtZQAAABAAAAAwQWRkcmVzcyBvZiB0aGUgbm9ucHJvZml0IHRoYXQgb3ducyB0aGUgY2FtcGFpZ24uAAAACW5vbnByb2ZpdAAAAAAAABMAAAAYQ3VycmVudCBsaWZlY3ljbGUgc3RhdGUuAAAABnN0YXR1cwAAAAAH0AAAAA5DYW1wYWlnblN0YXR1cwAAAAAA8EZ1bmRpbmcgZ29hbCBpbiB0aGUgc21hbGxlc3QgdW5pdCBvZiBgdG9rZW5fYWRkcmVzc2AuCgoqKkltcG9ydGFudCoqOiBUaGlzIGFtb3VudCBpcyBleHByZXNzZWQgaW4gTkVUIHRlcm1zICh3aGF0IHRoZSB2YXVsdAptdXN0IGFjY3VtdWxhdGUgYWZ0ZXIgcGxhdGZvcm0gZmVlcykuIFRoZSBmcm9udGVuZCBpcyByZXNwb25zaWJsZSBmb3IKY29tcHV0aW5nIHRoZSBncm9zcyBhbW91bnQgdGhlIGRvbm9yIG11c3QgcGF5LgAAAA10YXJnZXRfYW1vdW50AAAAAAAACwAAADlTRVAtNDEgdG9rZW4gdXNlZCBmb3IgZG9uYXRpb25zIChVU0RDLCBFVVJDLCBvciBhbnkgU0FDKS4AAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABM=",
        "AAAAAgAAACtMaWZlY3ljbGUgc3RhdGVzIG9mIGEgZnVuZHJhaXNpbmcgY2FtcGFpZ24uAAAAAAAAAAAOQ2FtcGFpZ25TdGF0dXMAAAAAAAMAAAAAAAAALEFjY2VwdGluZyBkb25hdGlvbnMgYW5kIHdpdGhpbiB0aGUgZGVhZGxpbmUuAAAABkFjdGl2ZQAAAAAAAAAAAENUYXJnZXQgcmVhY2hlZCBhbmQgZXZpZGVuY2UgdmFsaWRhdGVkOyBubyBmdXJ0aGVyIGFjdGlvbnMgcG9zc2libGUuAAAAAAlDb21wbGV0ZWQAAAAAAAAAAAAANkNhbmNlbGxlZCBieSB0aGUgbm9ucHJvZml0IGJlZm9yZSB0aGUgaW5pdGlhbCByZWxlYXNlLgAAAAAACUNhbmNlbGxlZAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_admin: this.txFromJSON<string>,
        accept_admin: this.txFromJSON<null>,
        get_campaign: this.txFromJSON<Campaign>,
        propose_admin: this.txFromJSON<null>,
        cancel_campaign: this.txFromJSON<null>,
        create_campaign: this.txFromJSON<u64>,
        get_pending_admin: this.txFromJSON<Option<string>>
  }
}