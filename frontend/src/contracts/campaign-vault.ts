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
 * Custody and release state for a specific campaign's funds.
 * 
 * Immutable fields (`target_amount`, `deadline`, `token_address`,
 * `milestone_percentage`) are cached at vault creation to eliminate
 * cross-contract calls on the hot path (`deposit`).
 */
export interface VaultState {
  /**
 * ID of the campaign this vault belongs to.
 */
campaign_id: u64;
  /**
 * Campaign deadline, cached from the registry.
 */
deadline: u64;
  /**
 * Hash of the latest evidence submitted by the nonprofit.
 */
evidence_hash: Option<Buffer>;
  /**
 * Whether the final release has been executed.
 */
final_release_done: boolean;
  /**
 * Whether the initial milestone has been released.
 */
initial_release_done: boolean;
  /**
 * Percentage released on initial milestone, cached from the registry.
 */
milestone_percentage: u32;
  /**
 * Address of the nonprofit that receives released funds.
 */
nonprofit: string;
  /**
 * Emergency pause flag. When true, deposits are blocked.
 */
paused: boolean;
  /**
 * Campaign goal, cached from the registry.
 */
target_amount: i128;
  /**
 * SEP-41 token held in custody.
 */
token_address: string;
  /**
 * Sum of all net deposits received so far.
 */
total_deposited: i128;
  /**
 * Address authorized to validate evidence and release final funds.
 * Can be an EOA (`G...`) or a smart account (`C...`).
 */
verifier: string;
}

export interface Client {
  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposits tokens into a campaign's vault.
   * 
   * # Milestone Trigger
   * When `total_deposited` reaches `target_amount`, the initial milestone
   * (`milestone_percentage` of `target_amount`) is released automatically
   * to the nonprofit.
   * 
   * # Router Enforcement
   * If `authorized_router` is configured, the router must authorize this
   * call. Direct deposits from arbitrary addresses are rejected with a
   * Soroban authentication error.
   * 
   * # Authorization
   * * `donor` must authorize the top-level call.
   * * If `authorized_router` is set, the router must be the direct invoker.
   */
  deposit: ({campaign_id, donor, amount}: {campaign_id: u64, donor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current admin.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current state of a campaign's vault.
   * 
   * # Errors
   * Returns `CampaignNotFound` if no vault exists for the campaign.
   */
  get_vault: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<VaultState>>

  /**
   * Construct and simulate a pause_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pauses a vault (emergency brake). While paused, `deposit` is blocked
   * and `claim_refund` becomes available even if the campaign has not
   * expired.
   * 
   * # Authorization
   * Only the admin can pause.
   */
  pause_vault: ({admin, campaign_id}: {admin: string, campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts the pending admin role.
   * 
   * # Authorization
   * Only the pending admin can accept.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claims a refund when the campaign expires or is cancelled without
   * reaching the initial milestone.
   * 
   * # Eligibility
   * Refund is available when ALL of these hold:
   * * `initial_release_done == false`
   * * AND (campaign is expired OR cancelled OR vault is paused)
   * 
   * # CEI
   * The contribution is zeroed BEFORE the transfer to prevent re-entrancy.
   * 
   * # Authorization
   * The `donor` must authorize this call.
   */
  claim_refund: ({campaign_id, donor}: {campaign_id: u64, donor: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a new vault for an approved campaign.
   * 
   * # Arguments
   * * `campaign_id` - ID of the campaign in the registry.
   * * `nonprofit` - Address of the nonprofit that owns the campaign.
   * * `verifier` - Address authorized to validate evidence and release
   * final funds. Can be an EOA or a smart account.
   * 
   * # Authorization
   * The `nonprofit` must authorize this call.
   */
  create_vault: ({campaign_id, nonprofit, verifier}: {campaign_id: u64, nonprofit: string, verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Proposes a new admin. The proposal must be accepted by the new admin.
   * 
   * # Authorization
   * Only the current admin can propose.
   */
  propose_admin: ({admin, new_admin}: {admin: string, new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a release_final transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Releases the final milestone to the nonprofit.
   * 
   * # TOCTOU Protection
   * The verifier must pass the exact evidence hash they reviewed. If the
   * nonprofit changed the evidence between review and release, the call
   * fails with `InvalidEvidenceHash`. This closes the time-of-check /
   * time-of-use gap.
   * 
   * # Error Semantics
   * Two distinct failures are intentionally distinguished:
   * * **`EvidenceNotSubmitted` (#8)**: no evidence has been submitted yet.
   * The verifier has nothing to review.
   * * **`InvalidEvidenceHash` (#29)**: evidence exists, but the hash the
   * verifier passed does not match the currently stored one. This usually
   * means the nonprofit overwrote the evidence between review and release.
   * 
   * Distinguishing these allows the frontend to give actionable feedback
   * ("wait for evidence" vs. "re-review because evidence changed").
   * 
   * # Authorization
   * Only the configured `verifier` can call this function.
   */
  release_final: ({campaign_id, verifier, expected_evidence}: {campaign_id: u64, verifier: string, expected_evidence: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unpause_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpauses a vault, restoring normal deposit behavior.
   * 
   * # Authorization
   * Only the admin can unpause.
   */
  unpause_vault: ({admin, campaign_id}: {admin: string, campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a submit_evidence transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submits evidence for the final milestone.
   * 
   * The evidence hash can be overwritten before `release_final` is called.
   * This is intentional: the nonprofit may correct errors in the submitted
   * evidence.
   * 
   * # Authorization
   * Only the nonprofit that owns the campaign can submit evidence.
   */
  submit_evidence: ({campaign_id, nonprofit, evidence_hash}: {campaign_id: u64, nonprofit: string, evidence_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the pending admin, if any.
   */
  get_pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_authorized_router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the authorized router, if any.
   */
  get_authorized_router: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a set_authorized_router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Configures or clears the authorized router.
   * 
   * When set to `Some(router)`, `deposit` requires `router.require_auth()`.
   * Since the router is the direct invoker when it calls `deposit`, the
   * authorization is implicitly granted by Soroban, and direct deposits
   * from arbitrary addresses are rejected.
   * 
   * # Authorization
   * Only the admin can configure the router.
   */
  set_authorized_router: ({admin, router}: {admin: string, router: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_verifier_for_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the verifier of an existing vault.
   * 
   * # Authorization
   * Only the admin can update the verifier.
   */
  set_verifier_for_campaign: ({admin, campaign_id, verifier}: {admin: string, campaign_id: u64, verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, campaign_registry}: {admin: string, campaign_registry: string},
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
    return ContractClient.deploy({admin, campaign_registry}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAh1EZXBvc2l0cyB0b2tlbnMgaW50byBhIGNhbXBhaWduJ3MgdmF1bHQuCgojIE1pbGVzdG9uZSBUcmlnZ2VyCldoZW4gYHRvdGFsX2RlcG9zaXRlZGAgcmVhY2hlcyBgdGFyZ2V0X2Ftb3VudGAsIHRoZSBpbml0aWFsIG1pbGVzdG9uZQooYG1pbGVzdG9uZV9wZXJjZW50YWdlYCBvZiBgdGFyZ2V0X2Ftb3VudGApIGlzIHJlbGVhc2VkIGF1dG9tYXRpY2FsbHkKdG8gdGhlIG5vbnByb2ZpdC4KCiMgUm91dGVyIEVuZm9yY2VtZW50CklmIGBhdXRob3JpemVkX3JvdXRlcmAgaXMgY29uZmlndXJlZCwgdGhlIHJvdXRlciBtdXN0IGF1dGhvcml6ZSB0aGlzCmNhbGwuIERpcmVjdCBkZXBvc2l0cyBmcm9tIGFyYml0cmFyeSBhZGRyZXNzZXMgYXJlIHJlamVjdGVkIHdpdGggYQpTb3JvYmFuIGF1dGhlbnRpY2F0aW9uIGVycm9yLgoKIyBBdXRob3JpemF0aW9uCiogYGRvbm9yYCBtdXN0IGF1dGhvcml6ZSB0aGUgdG9wLWxldmVsIGNhbGwuCiogSWYgYGF1dGhvcml6ZWRfcm91dGVyYCBpcyBzZXQsIHRoZSByb3V0ZXIgbXVzdCBiZSB0aGUgZGlyZWN0IGludm9rZXIuAAAAAAAAB2RlcG9zaXQAAAAAAwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAABpSZXR1cm5zIHRoZSBjdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAHpSZXR1cm5zIHRoZSBjdXJyZW50IHN0YXRlIG9mIGEgY2FtcGFpZ24ncyB2YXVsdC4KCiMgRXJyb3JzClJldHVybnMgYENhbXBhaWduTm90Rm91bmRgIGlmIG5vIHZhdWx0IGV4aXN0cyBmb3IgdGhlIGNhbXBhaWduLgAAAAAACWdldF92YXVsdAAAAAAAAAEAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAH0AAAAApWYXVsdFN0YXRlAAA=",
        "AAAAAAAAALpQYXVzZXMgYSB2YXVsdCAoZW1lcmdlbmN5IGJyYWtlKS4gV2hpbGUgcGF1c2VkLCBgZGVwb3NpdGAgaXMgYmxvY2tlZAphbmQgYGNsYWltX3JlZnVuZGAgYmVjb21lcyBhdmFpbGFibGUgZXZlbiBpZiB0aGUgY2FtcGFpZ24gaGFzIG5vdApleHBpcmVkLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIGFkbWluIGNhbiBwYXVzZS4AAAAAAAtwYXVzZV92YXVsdAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAA",
        "AAAAAAAAAFNBY2NlcHRzIHRoZSBwZW5kaW5nIGFkbWluIHJvbGUuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgcGVuZGluZyBhZG1pbiBjYW4gYWNjZXB0LgAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAAX9DbGFpbXMgYSByZWZ1bmQgd2hlbiB0aGUgY2FtcGFpZ24gZXhwaXJlcyBvciBpcyBjYW5jZWxsZWQgd2l0aG91dApyZWFjaGluZyB0aGUgaW5pdGlhbCBtaWxlc3RvbmUuCgojIEVsaWdpYmlsaXR5ClJlZnVuZCBpcyBhdmFpbGFibGUgd2hlbiBBTEwgb2YgdGhlc2UgaG9sZDoKKiBgaW5pdGlhbF9yZWxlYXNlX2RvbmUgPT0gZmFsc2VgCiogQU5EIChjYW1wYWlnbiBpcyBleHBpcmVkIE9SIGNhbmNlbGxlZCBPUiB2YXVsdCBpcyBwYXVzZWQpCgojIENFSQpUaGUgY29udHJpYnV0aW9uIGlzIHplcm9lZCBCRUZPUkUgdGhlIHRyYW5zZmVyIHRvIHByZXZlbnQgcmUtZW50cmFuY3kuCgojIEF1dGhvcml6YXRpb24KVGhlIGBkb25vcmAgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsLgAAAAAMY2xhaW1fcmVmdW5kAAAAAgAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAA==",
        "AAAAAAAAAV5DcmVhdGVzIGEgbmV3IHZhdWx0IGZvciBhbiBhcHByb3ZlZCBjYW1wYWlnbi4KCiMgQXJndW1lbnRzCiogYGNhbXBhaWduX2lkYCAtIElEIG9mIHRoZSBjYW1wYWlnbiBpbiB0aGUgcmVnaXN0cnkuCiogYG5vbnByb2ZpdGAgLSBBZGRyZXNzIG9mIHRoZSBub25wcm9maXQgdGhhdCBvd25zIHRoZSBjYW1wYWlnbi4KKiBgdmVyaWZpZXJgIC0gQWRkcmVzcyBhdXRob3JpemVkIHRvIHZhbGlkYXRlIGV2aWRlbmNlIGFuZCByZWxlYXNlCmZpbmFsIGZ1bmRzLiBDYW4gYmUgYW4gRU9BIG9yIGEgc21hcnQgYWNjb3VudC4KCiMgQXV0aG9yaXphdGlvbgpUaGUgYG5vbnByb2ZpdGAgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsLgAAAAAADGNyZWF0ZV92YXVsdAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAOdJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbiBhbmQgdGhlIENhbXBhaWduIFJlZ2lzdHJ5IGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBBZGRyZXNzIGF1dGhvcml6ZWQgdG8gY29uZmlndXJlIHRoZSB2YXVsdCAoRU9BIG9yIHNtYXJ0IGFjY291bnQpLgoqIGBjYW1wYWlnbl9yZWdpc3RyeWAgLSBBZGRyZXNzIG9mIHRoZSBkZXBsb3llZCBDYW1wYWlnbiBSZWdpc3RyeS4AAAAADV9fY29uc3RydWN0b3IAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAEWNhbXBhaWduX3JlZ2lzdHJ5AAAAAAAAEwAAAAA=",
        "AAAAAAAAAHpQcm9wb3NlcyBhIG5ldyBhZG1pbi4gVGhlIHByb3Bvc2FsIG11c3QgYmUgYWNjZXB0ZWQgYnkgdGhlIG5ldyBhZG1pbi4KCiMgQXV0aG9yaXphdGlvbgpPbmx5IHRoZSBjdXJyZW50IGFkbWluIGNhbiBwcm9wb3NlLgAAAAAADXByb3Bvc2VfYWRtaW4AAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAA3RSZWxlYXNlcyB0aGUgZmluYWwgbWlsZXN0b25lIHRvIHRoZSBub25wcm9maXQuCgojIFRPQ1RPVSBQcm90ZWN0aW9uClRoZSB2ZXJpZmllciBtdXN0IHBhc3MgdGhlIGV4YWN0IGV2aWRlbmNlIGhhc2ggdGhleSByZXZpZXdlZC4gSWYgdGhlCm5vbnByb2ZpdCBjaGFuZ2VkIHRoZSBldmlkZW5jZSBiZXR3ZWVuIHJldmlldyBhbmQgcmVsZWFzZSwgdGhlIGNhbGwKZmFpbHMgd2l0aCBgSW52YWxpZEV2aWRlbmNlSGFzaGAuIFRoaXMgY2xvc2VzIHRoZSB0aW1lLW9mLWNoZWNrIC8KdGltZS1vZi11c2UgZ2FwLgoKIyBFcnJvciBTZW1hbnRpY3MKVHdvIGRpc3RpbmN0IGZhaWx1cmVzIGFyZSBpbnRlbnRpb25hbGx5IGRpc3Rpbmd1aXNoZWQ6CiogKipgRXZpZGVuY2VOb3RTdWJtaXR0ZWRgICgjOCkqKjogbm8gZXZpZGVuY2UgaGFzIGJlZW4gc3VibWl0dGVkIHlldC4KVGhlIHZlcmlmaWVyIGhhcyBub3RoaW5nIHRvIHJldmlldy4KKiAqKmBJbnZhbGlkRXZpZGVuY2VIYXNoYCAoIzI5KSoqOiBldmlkZW5jZSBleGlzdHMsIGJ1dCB0aGUgaGFzaCB0aGUKdmVyaWZpZXIgcGFzc2VkIGRvZXMgbm90IG1hdGNoIHRoZSBjdXJyZW50bHkgc3RvcmVkIG9uZS4gVGhpcyB1c3VhbGx5Cm1lYW5zIHRoZSBub25wcm9maXQgb3Zlcndyb3RlIHRoZSBldmlkZW5jZSBiZXR3ZWVuIHJldmlldyBhbmQgcmVsZWFzZS4KCkRpc3Rpbmd1aXNoaW5nIHRoZXNlIGFsbG93cyB0aGUgZnJvbnRlbmQgdG8gZ2l2ZSBhY3Rpb25hYmxlIGZlZWRiYWNrCigid2FpdCBmb3IgZXZpZGVuY2UiIHZzLiAicmUtcmV2aWV3IGJlY2F1c2UgZXZpZGVuY2UgY2hhbmdlZCIpLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIGNvbmZpZ3VyZWQgYHZlcmlmaWVyYCBjYW4gY2FsbCB0aGlzIGZ1bmN0aW9uLgAAAA1yZWxlYXNlX2ZpbmFsAAAAAAAAAwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAAAAABFleHBlY3RlZF9ldmlkZW5jZQAAAAAAAA4AAAAA",
        "AAAAAAAAAGFVbnBhdXNlcyBhIHZhdWx0LCByZXN0b3Jpbmcgbm9ybWFsIGRlcG9zaXQgYmVoYXZpb3IuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgYWRtaW4gY2FuIHVucGF1c2UuAAAAAAAADXVucGF1c2VfdmF1bHQAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAA",
        "AAAAAAAAARJTdWJtaXRzIGV2aWRlbmNlIGZvciB0aGUgZmluYWwgbWlsZXN0b25lLgoKVGhlIGV2aWRlbmNlIGhhc2ggY2FuIGJlIG92ZXJ3cml0dGVuIGJlZm9yZSBgcmVsZWFzZV9maW5hbGAgaXMgY2FsbGVkLgpUaGlzIGlzIGludGVudGlvbmFsOiB0aGUgbm9ucHJvZml0IG1heSBjb3JyZWN0IGVycm9ycyBpbiB0aGUgc3VibWl0dGVkCmV2aWRlbmNlLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIG5vbnByb2ZpdCB0aGF0IG93bnMgdGhlIGNhbXBhaWduIGNhbiBzdWJtaXQgZXZpZGVuY2UuAAAAAAAPc3VibWl0X2V2aWRlbmNlAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAAOAAAAAA==",
        "AAAAAAAAACJSZXR1cm5zIHRoZSBwZW5kaW5nIGFkbWluLCBpZiBhbnkuAAAAAAARZ2V0X3BlbmRpbmdfYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAACZSZXR1cm5zIHRoZSBhdXRob3JpemVkIHJvdXRlciwgaWYgYW55LgAAAAAAFWdldF9hdXRob3JpemVkX3JvdXRlcgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAV1Db25maWd1cmVzIG9yIGNsZWFycyB0aGUgYXV0aG9yaXplZCByb3V0ZXIuCgpXaGVuIHNldCB0byBgU29tZShyb3V0ZXIpYCwgYGRlcG9zaXRgIHJlcXVpcmVzIGByb3V0ZXIucmVxdWlyZV9hdXRoKClgLgpTaW5jZSB0aGUgcm91dGVyIGlzIHRoZSBkaXJlY3QgaW52b2tlciB3aGVuIGl0IGNhbGxzIGBkZXBvc2l0YCwgdGhlCmF1dGhvcml6YXRpb24gaXMgaW1wbGljaXRseSBncmFudGVkIGJ5IFNvcm9iYW4sIGFuZCBkaXJlY3QgZGVwb3NpdHMKZnJvbSBhcmJpdHJhcnkgYWRkcmVzc2VzIGFyZSByZWplY3RlZC4KCiMgQXV0aG9yaXphdGlvbgpPbmx5IHRoZSBhZG1pbiBjYW4gY29uZmlndXJlIHRoZSByb3V0ZXIuAAAAAAAAFXNldF9hdXRob3JpemVkX3JvdXRlcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAGcm91dGVyAAAAAAPoAAAAEwAAAAA=",
        "AAAAAAAAAGNVcGRhdGVzIHRoZSB2ZXJpZmllciBvZiBhbiBleGlzdGluZyB2YXVsdC4KCiMgQXV0aG9yaXphdGlvbgpPbmx5IHRoZSBhZG1pbiBjYW4gdXBkYXRlIHRoZSB2ZXJpZmllci4AAAAAGXNldF92ZXJpZmllcl9mb3JfY2FtcGFpZ24AAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAA=",
        "AAAABQAAADhFbWl0dGVkIHdoZW4gdGhlIGFkbWluIHBhdXNlcyBhIHZhdWx0IChlbWVyZ2VuY3kgYnJha2UpLgAAAAAAAAALVmF1bHRQYXVzZWQAAAAAAQAAAAx2YXVsdF9wYXVzZWQAAAABAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAADNFbWl0dGVkIHdoZW4gYSBuZXcgdmF1bHQgaXMgY3JlYXRlZCBmb3IgYSBjYW1wYWlnbi4AAAAAAAAAAAxWYXVsdENyZWF0ZWQAAAABAAAADXZhdWx0X2NyZWF0ZWQAAAAAAAAEAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAAAAAAI=",
        "AAAABQAAADFFbWl0dGVkIHdoZW4gdGhlIHByb3Bvc2VkIGFkbWluIGFjY2VwdHMgdGhlIHJvbGUuAAAAAAAAAAAAAA1BZG1pbkFjY2VwdGVkAAAAAAAAAQAAAA5hZG1pbl9hY2NlcHRlZAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIGN1cnJlbnQgYWRtaW4gcHJvcG9zZXMgYSBuZXcgYWRtaW4uAAAAAAAAAA1BZG1pblByb3Bvc2VkAAAAAAAAAQAAAA5hZG1pbl9wcm9wb3NlZAAAAAAAAgAAAAAAAAAHY3VycmVudAAAAAATAAAAAAAAAAAAAAAIcHJvcG9zZWQAAAATAAAAAAAAAAI=",
        "AAAABQAAAHVFbWl0dGVkIHdoZW4gYSBkb25vciBjbGFpbXMgYSByZWZ1bmQgYWZ0ZXIgYSBjYW1wYWlnbiBleHBpcmVzIG9yIGlzCmNhbmNlbGxlZCB3aXRob3V0IHJlYWNoaW5nIHRoZSBpbml0aWFsIG1pbGVzdG9uZS4AAAAAAAAAAAAADVJlZnVuZENsYWltZWQAAAAAAAABAAAADnJlZnVuZF9jbGFpbWVkAAAAAAADAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAChFbWl0dGVkIHdoZW4gdGhlIGFkbWluIHVucGF1c2VzIGEgdmF1bHQuAAAAAAAAAA1WYXVsdFVucGF1c2VkAAAAAAAAAQAAAA52YXVsdF91bnBhdXNlZAAAAAAAAQAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAC",
        "AAAABQAAADpFbWl0dGVkIHdoZW4gdGhlIGFkbWluIGNoYW5nZXMgdGhlIHZlcmlmaWVyIG9mIGEgY2FtcGFpZ24uAAAAAAAAAAAAD1ZlcmlmaWVyVXBkYXRlZAAAAAABAAAAEHZlcmlmaWVyX3VwZGF0ZWQAAAACAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAMbmV3X3ZlcmlmaWVyAAAAEwAAAAAAAAAC",
        "AAAABQAAAD1FbWl0dGVkIHdoZW4gYSBkb25hdGlvbiBpcyBkZXBvc2l0ZWQgaW50byBhIGNhbXBhaWduJ3MgdmF1bHQuAAAAAAAAAAAAABFEb25hdGlvbkRlcG9zaXRlZAAAAAAAAAEAAAASZG9uYXRpb25fZGVwb3NpdGVkAAAAAAAEAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAPdG90YWxfZGVwb3NpdGVkAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAADtFbWl0dGVkIHdoZW4gZXZpZGVuY2UgaXMgc3VibWl0dGVkIGZvciB0aGUgZmluYWwgbWlsZXN0b25lLgAAAAAAAAAAEUV2aWRlbmNlU3VibWl0dGVkAAAAAAAAAQAAABJldmlkZW5jZV9zdWJtaXR0ZWQAAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAAAAAAAAAAANZXZpZGVuY2VfaGFzaAAAAAAAAA4AAAAAAAAAAg==",
        "AAAABQAAAHtFbWl0dGVkIHdoZW4gdGhlIGZpbmFsIGJhbGFuY2UgKHRhcmdldCBtaW51cyB0aGUgaW5pdGlhbCBtaWxlc3RvbmUpIGlzCnJlbGVhc2VkIHRvIHRoZSBub25wcm9maXQgYWZ0ZXIgZXZpZGVuY2UgdmFsaWRhdGlvbi4AAAAAAAAAABJGaW5hbEZ1bmRzUmVsZWFzZWQAAAAAAAEAAAAUZmluYWxfZnVuZHNfcmVsZWFzZWQAAAADAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAIZFbWl0dGVkIHdoZW4gdGhlIGluaXRpYWwgbWlsZXN0b25lICh0aGUgY29uZmlndXJlZCBwZXJjZW50YWdlIG9mCmB0YXJnZXRfYW1vdW50YCkgaXMgcmVsZWFzZWQgdG8gdGhlIG5vbnByb2ZpdCB1cG9uIHJlYWNoaW5nIHRoZSBnb2FsLgAAAAAAAAAAABRJbml0aWFsRnVuZHNSZWxlYXNlZAAAAAEAAAAWaW5pdGlhbF9mdW5kc19yZWxlYXNlZAAAAAAAAwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAEJFbWl0dGVkIHdoZW4gdGhlIGFkbWluIGNvbmZpZ3VyZXMgb3IgY2xlYXJzIHRoZSBhdXRob3JpemVkIHJvdXRlci4AAAAAAAAAAAAXQXV0aG9yaXplZFJvdXRlclVwZGF0ZWQAAAAAAQAAABlhdXRob3JpemVkX3JvdXRlcl91cGRhdGVkAAAAAAAAAQAAAAAAAAARYXV0aG9yaXplZF9yb3V0ZXIAAAAAAAPoAAAAEwAAAAAAAAAC",
        "AAAABAAAAUVTaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKIyBTdGFiaWxpdHkgQ29udHJhY3QKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKiouIEV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsCmluZGV4ZXJzLCBtb25pdG9yaW5nIGRhc2hib2FyZHMsIGF1ZGl0IHJlcG9ydHMpIHJlbHkgb24gc3RhYmxlIG51bWVyaWMKZGlzY3JpbWluYW50cy4gR2FwcyBpbiB0aGUgc2VxdWVuY2UgaW5kaWNhdGUgcmVzZXJ2ZWQgY29kZXMuIE5ldyBjb2RlcwpNVVNUIGJlIGFwcGVuZGVkIGF0IHRoZSBlbmQuAAAAAAAAAAAAAAVFcnJvcgAAAAAAABoAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAADVVGhlIG1pbGVzdG9uZSBwZXJjZW50YWdlIGlzIG91dHNpZGUgdGhlIGFsbG93ZWQgcmFuZ2UKKGBNSU5fTUlMRVNUT05FX1BFUkNFTlRBR0UuLj1NQVhfTUlMRVNUT05FX1BFUkNFTlRBR0VgKS4KClRoZSB1cHBlciBib3VuZCAoOTAlKSBndWFyYW50ZWVzIHRoYXQgYXQgbGVhc3QgMTAlIG9mIHRoZSB0YXJnZXQKcmVtYWlucyB0aWVkIHRvIGV2aWRlbmNlIHZhbGlkYXRpb24uAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAAAAAABNOb3RBdXRob3JpemVkUm91dGVyAAAAABoAAABEUmVmdW5kIG5vdCBhdmFpbGFibGU6IGNhbXBhaWduIHN0aWxsIGFjdGl2ZSBvciBpbml0aWFsIHJlbGVhc2UgZG9uZS4AAAASUmVmdW5kTm90QXZhaWxhYmxlAAAAAAAbAAAAKFRoZSBkb25vciBoYXMgbm8gY29udHJpYnV0aW9uIHRvIHJlZnVuZC4AAAAPTm90aGluZ1RvUmVmdW5kAAAAABwAAAA1UHJvdmlkZWQgZXZpZGVuY2UgaGFzaCBkb2VzIG5vdCBtYXRjaCB0aGUgc3RvcmVkIG9uZS4AAAAAAAATSW52YWxpZEV2aWRlbmNlSGFzaAAAAAAdAAAAJkNhbGxlciBpcyBub3QgdGhlIGNvbmZpZ3VyZWQgdmVyaWZpZXIuAAAAAAALTm90VmVyaWZpZXIAAAAAHgAAACBDYWxsZXIgaXMgbm90IHRoZSBwZW5kaW5nIGFkbWluLgAAAA9Ob3RQZW5kaW5nQWRtaW4AAAAAHwAAACpUaGUgdmF1bHQgaXMgcGF1c2VkOyBkZXBvc2l0cyBhcmUgYmxvY2tlZC4AAAAAAAtWYXVsdFBhdXNlZAAAAAAg",
        "AAAAAQAAAO9DdXN0b2R5IGFuZCByZWxlYXNlIHN0YXRlIGZvciBhIHNwZWNpZmljIGNhbXBhaWduJ3MgZnVuZHMuCgpJbW11dGFibGUgZmllbGRzIChgdGFyZ2V0X2Ftb3VudGAsIGBkZWFkbGluZWAsIGB0b2tlbl9hZGRyZXNzYCwKYG1pbGVzdG9uZV9wZXJjZW50YWdlYCkgYXJlIGNhY2hlZCBhdCB2YXVsdCBjcmVhdGlvbiB0byBlbGltaW5hdGUKY3Jvc3MtY29udHJhY3QgY2FsbHMgb24gdGhlIGhvdCBwYXRoIChgZGVwb3NpdGApLgAAAAAAAAAAClZhdWx0U3RhdGUAAAAAAAwAAAApSUQgb2YgdGhlIGNhbXBhaWduIHRoaXMgdmF1bHQgYmVsb25ncyB0by4AAAAAAAALY2FtcGFpZ25faWQAAAAABgAAACxDYW1wYWlnbiBkZWFkbGluZSwgY2FjaGVkIGZyb20gdGhlIHJlZ2lzdHJ5LgAAAAhkZWFkbGluZQAAAAYAAAA3SGFzaCBvZiB0aGUgbGF0ZXN0IGV2aWRlbmNlIHN1Ym1pdHRlZCBieSB0aGUgbm9ucHJvZml0LgAAAAANZXZpZGVuY2VfaGFzaAAAAAAAA+gAAAAOAAAALFdoZXRoZXIgdGhlIGZpbmFsIHJlbGVhc2UgaGFzIGJlZW4gZXhlY3V0ZWQuAAAAEmZpbmFsX3JlbGVhc2VfZG9uZQAAAAAAAQAAADBXaGV0aGVyIHRoZSBpbml0aWFsIG1pbGVzdG9uZSBoYXMgYmVlbiByZWxlYXNlZC4AAAAUaW5pdGlhbF9yZWxlYXNlX2RvbmUAAAABAAAAQ1BlcmNlbnRhZ2UgcmVsZWFzZWQgb24gaW5pdGlhbCBtaWxlc3RvbmUsIGNhY2hlZCBmcm9tIHRoZSByZWdpc3RyeS4AAAAAFG1pbGVzdG9uZV9wZXJjZW50YWdlAAAABAAAADZBZGRyZXNzIG9mIHRoZSBub25wcm9maXQgdGhhdCByZWNlaXZlcyByZWxlYXNlZCBmdW5kcy4AAAAAAAlub25wcm9maXQAAAAAAAATAAAANkVtZXJnZW5jeSBwYXVzZSBmbGFnLiBXaGVuIHRydWUsIGRlcG9zaXRzIGFyZSBibG9ja2VkLgAAAAAABnBhdXNlZAAAAAAAAQAAAChDYW1wYWlnbiBnb2FsLCBjYWNoZWQgZnJvbSB0aGUgcmVnaXN0cnkuAAAADXRhcmdldF9hbW91bnQAAAAAAAALAAAAHVNFUC00MSB0b2tlbiBoZWxkIGluIGN1c3RvZHkuAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAKFN1bSBvZiBhbGwgbmV0IGRlcG9zaXRzIHJlY2VpdmVkIHNvIGZhci4AAAAPdG90YWxfZGVwb3NpdGVkAAAAAAsAAAB0QWRkcmVzcyBhdXRob3JpemVkIHRvIHZhbGlkYXRlIGV2aWRlbmNlIGFuZCByZWxlYXNlIGZpbmFsIGZ1bmRzLgpDYW4gYmUgYW4gRU9BIChgRy4uLmApIG9yIGEgc21hcnQgYWNjb3VudCAoYEMuLi5gKS4AAAAIdmVyaWZpZXIAAAAT" ]),
      options
    )
  }
  public readonly fromJSON = {
    deposit: this.txFromJSON<null>,
        get_admin: this.txFromJSON<string>,
        get_vault: this.txFromJSON<VaultState>,
        pause_vault: this.txFromJSON<null>,
        accept_admin: this.txFromJSON<null>,
        claim_refund: this.txFromJSON<null>,
        create_vault: this.txFromJSON<null>,
        propose_admin: this.txFromJSON<null>,
        release_final: this.txFromJSON<null>,
        unpause_vault: this.txFromJSON<null>,
        submit_evidence: this.txFromJSON<null>,
        get_pending_admin: this.txFromJSON<Option<string>>,
        get_authorized_router: this.txFromJSON<Option<string>>,
        set_authorized_router: this.txFromJSON<null>,
        set_verifier_for_campaign: this.txFromJSON<null>
  }
}