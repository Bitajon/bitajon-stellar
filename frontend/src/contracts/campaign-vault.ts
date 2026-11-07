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
 * Defines the custody and release state for a specific campaign's funds.
 * 
 * Immutable fields (`target_amount`, `deadline`, `token_address`) are cached
 * at vault creation to avoid repeated cross-contract calls on the hot path
 * (`deposit`).
 */
export interface VaultState {
  campaign_id: u64;
  deadline: u64;
  evidence_hash: Option<Buffer>;
  final_release_done: boolean;
  initial_release_done: boolean;
  nonprofit: string;
  target_amount: i128;
  token_address: string;
  total_deposited: i128;
}

export interface Client {
  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposits tokens into a campaign's vault.
   * 
   * If the deposit causes `total_deposited` to reach `target_amount` and the
   * initial release has not occurred, this function atomically releases the
   * initial milestone amount (default: 50%) to the nonprofit.
   * 
   * # Router Enforcement
   * If `authorized_router` is configured (via `set_authorized_router`), the
   * router must authorize this call. This is verified with
   * `router.require_auth()`. Since the router is the direct invoker when it
   * calls this function, the authorization is implicitly granted (per Soroban's
   * "Contract Invoker" rule). A donor calling directly cannot satisfy this
   * requirement, closing the platform-fee bypass.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign.
   * * `donor` - The address of the donor. Must authorize the top-level call.
   * * `amount` - The amount of tokens to deposit. Must be strictly positive.
   * 
   * # Errors
   * * `InvalidAmount` if `amount <= 0`.
   * * `CampaignNotFound` if no vault exists for the campaign.
   * * `VaultFinalized` if the final release has already occurred
   */
  deposit: ({campaign_id, donor, amount}: {campaign_id: u64, donor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves the vault state for a specific campaign.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign.
   * 
   * # Returns
   * The `VaultState` struct.
   * 
   * # Errors
   * * `CampaignNotFound` if no vault exists for the campaign.
   * 
   * # Notes
   * Extends the instance TTL as a defensive measure to keep the contract
   * alive during quiet periods. This is a deliberate trade-off (one ledger
   * write per query) for a donation platform where users browse frequently.
   */
  get_vault: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<VaultState>>

  /**
   * Construct and simulate a create_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a new vault for a specific campaign.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign in the `campaign-registry`.
   * * `nonprofit` - The address of the nonprofit that owns the campaign.
   * 
   * # Authorization
   * The `nonprofit` address must authorize this call.
   * 
   * # Errors
   * * `CampaignAlreadyExists` if a vault already exists for this campaign.
   * * `CampaignNotFound` if the campaign does not exist in the registry.
   * * `CampaignNotActive` if the campaign is not active.
   * * `Unauthorized` if `nonprofit` is not the campaign owner.
   */
  create_vault: ({campaign_id, nonprofit}: {campaign_id: u64, nonprofit: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a release_final transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Releases the final milestone amount to the nonprofit after evidence validation.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign.
   * * `admin` - The address of the admin validating the evidence.
   * 
   * # Authorization
   * Only the `admin` configured in the constructor can call this function.
   * 
   * # Errors
   * * `NotVaultAdmin` if the caller is not the configured admin.
   * * `CampaignNotFound` if no vault exists for the campaign.
   * * `FinalAlreadyReleased` if the final release has already occurred.
   * * `EvidenceNotSubmitted` if no evidence has been submitted.
   */
  release_final: ({campaign_id, admin}: {campaign_id: u64, admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a submit_evidence transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submits evidence for the final milestone.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign.
   * * `nonprofit` - The address of the nonprofit submitting evidence.
   * * `evidence_hash` - A non-empty hash of the evidence (e.g., IPFS CID).
   * 
   * # Authorization
   * The `nonprofit` address must authorize this call and match the vault owner.
   * 
   * # Errors
   * * `CampaignNotFound` if no vault exists for the campaign.
   * * `Unauthorized` if the caller is not the campaign's nonprofit.
   * * `InitialReleaseNotDone` if the initial milestone has not been released yet.
   * * `VaultFinalized` if the final release has already occurred.
   * * `InvalidEvidence` if `evidence_hash` is empty.
   */
  submit_evidence: ({campaign_id, nonprofit, evidence_hash}: {campaign_id: u64, nonprofit: string, evidence_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_authorized_router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the currently configured authorized router, if any.
   * 
   * `None` means the vault is in open mode.
   */
  get_authorized_router: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a set_authorized_router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Configures or clears the authorized donation router.
   * 
   * When set to `Some(router)`, `deposit` requires `router.require_auth()`,
   * which closes the platform-fee bypass. When set to `None`, the vault is
   * in open mode: any address can call `deposit` directly.
   * 
   * # Arguments
   * * `admin` - The admin address (must authorize).
   * * `router` - `Some(router_address)` to restrict deposits, `None` to open.
   * 
   * # Authorization
   * Only the `admin` configured in the constructor can call this function.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the configured admin.
   */
  set_authorized_router: ({admin, router}: {admin: string, router: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAAAABABEZXBvc2l0cyB0b2tlbnMgaW50byBhIGNhbXBhaWduJ3MgdmF1bHQuCgpJZiB0aGUgZGVwb3NpdCBjYXVzZXMgYHRvdGFsX2RlcG9zaXRlZGAgdG8gcmVhY2ggYHRhcmdldF9hbW91bnRgIGFuZCB0aGUKaW5pdGlhbCByZWxlYXNlIGhhcyBub3Qgb2NjdXJyZWQsIHRoaXMgZnVuY3Rpb24gYXRvbWljYWxseSByZWxlYXNlcyB0aGUKaW5pdGlhbCBtaWxlc3RvbmUgYW1vdW50IChkZWZhdWx0OiA1MCUpIHRvIHRoZSBub25wcm9maXQuCgojIFJvdXRlciBFbmZvcmNlbWVudApJZiBgYXV0aG9yaXplZF9yb3V0ZXJgIGlzIGNvbmZpZ3VyZWQgKHZpYSBgc2V0X2F1dGhvcml6ZWRfcm91dGVyYCksIHRoZQpyb3V0ZXIgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsLiBUaGlzIGlzIHZlcmlmaWVkIHdpdGgKYHJvdXRlci5yZXF1aXJlX2F1dGgoKWAuIFNpbmNlIHRoZSByb3V0ZXIgaXMgdGhlIGRpcmVjdCBpbnZva2VyIHdoZW4gaXQKY2FsbHMgdGhpcyBmdW5jdGlvbiwgdGhlIGF1dGhvcml6YXRpb24gaXMgaW1wbGljaXRseSBncmFudGVkIChwZXIgU29yb2JhbidzCiJDb250cmFjdCBJbnZva2VyIiBydWxlKS4gQSBkb25vciBjYWxsaW5nIGRpcmVjdGx5IGNhbm5vdCBzYXRpc2Z5IHRoaXMKcmVxdWlyZW1lbnQsIGNsb3NpbmcgdGhlIHBsYXRmb3JtLWZlZSBieXBhc3MuCgojIEFyZ3VtZW50cwoqIGBjYW1wYWlnbl9pZGAgLSBUaGUgSUQgb2YgdGhlIGNhbXBhaWduLgoqIGBkb25vcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgZG9ub3IuIE11c3QgYXV0aG9yaXplIHRoZSB0b3AtbGV2ZWwgY2FsbC4KKiBgYW1vdW50YCAtIFRoZSBhbW91bnQgb2YgdG9rZW5zIHRvIGRlcG9zaXQuIE11c3QgYmUgc3RyaWN0bHkgcG9zaXRpdmUuCgojIEVycm9ycwoqIGBJbnZhbGlkQW1vdW50YCBpZiBgYW1vdW50IDw9IDBgLgoqIGBDYW1wYWlnbk5vdEZvdW5kYCBpZiBubyB2YXVsdCBleGlzdHMgZm9yIHRoZSBjYW1wYWlnbi4KKiBgVmF1bHRGaW5hbGl6ZWRgIGlmIHRoZSBmaW5hbCByZWxlYXNlIGhhcyBhbHJlYWR5IG9jY3VycmVkAAAAB2RlcG9zaXQAAAAAAwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAa5SZXRyaWV2ZXMgdGhlIHZhdWx0IHN0YXRlIGZvciBhIHNwZWNpZmljIGNhbXBhaWduLgoKIyBBcmd1bWVudHMKKiBgY2FtcGFpZ25faWRgIC0gVGhlIElEIG9mIHRoZSBjYW1wYWlnbi4KCiMgUmV0dXJucwpUaGUgYFZhdWx0U3RhdGVgIHN0cnVjdC4KCiMgRXJyb3JzCiogYENhbXBhaWduTm90Rm91bmRgIGlmIG5vIHZhdWx0IGV4aXN0cyBmb3IgdGhlIGNhbXBhaWduLgoKIyBOb3RlcwpFeHRlbmRzIHRoZSBpbnN0YW5jZSBUVEwgYXMgYSBkZWZlbnNpdmUgbWVhc3VyZSB0byBrZWVwIHRoZSBjb250cmFjdAphbGl2ZSBkdXJpbmcgcXVpZXQgcGVyaW9kcy4gVGhpcyBpcyBhIGRlbGliZXJhdGUgdHJhZGUtb2ZmIChvbmUgbGVkZ2VyCndyaXRlIHBlciBxdWVyeSkgZm9yIGEgZG9uYXRpb24gcGxhdGZvcm0gd2hlcmUgdXNlcnMgYnJvd3NlIGZyZXF1ZW50bHkuAAAAAAAJZ2V0X3ZhdWx0AAAAAAAAAQAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAfQAAAAClZhdWx0U3RhdGUAAA==",
        "AAAAAAAAAgxDcmVhdGVzIGEgbmV3IHZhdWx0IGZvciBhIHNwZWNpZmljIGNhbXBhaWduLgoKIyBBcmd1bWVudHMKKiBgY2FtcGFpZ25faWRgIC0gVGhlIElEIG9mIHRoZSBjYW1wYWlnbiBpbiB0aGUgYGNhbXBhaWduLXJlZ2lzdHJ5YC4KKiBgbm9ucHJvZml0YCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBub25wcm9maXQgdGhhdCBvd25zIHRoZSBjYW1wYWlnbi4KCiMgQXV0aG9yaXphdGlvbgpUaGUgYG5vbnByb2ZpdGAgYWRkcmVzcyBtdXN0IGF1dGhvcml6ZSB0aGlzIGNhbGwuCgojIEVycm9ycwoqIGBDYW1wYWlnbkFscmVhZHlFeGlzdHNgIGlmIGEgdmF1bHQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgY2FtcGFpZ24uCiogYENhbXBhaWduTm90Rm91bmRgIGlmIHRoZSBjYW1wYWlnbiBkb2VzIG5vdCBleGlzdCBpbiB0aGUgcmVnaXN0cnkuCiogYENhbXBhaWduTm90QWN0aXZlYCBpZiB0aGUgY2FtcGFpZ24gaXMgbm90IGFjdGl2ZS4KKiBgVW5hdXRob3JpemVkYCBpZiBgbm9ucHJvZml0YCBpcyBub3QgdGhlIGNhbXBhaWduIG93bmVyLgAAAAxjcmVhdGVfdmF1bHQAAAACAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAA==",
        "AAAAAAAAAgJJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbmlzdHJhdG9yIGFkZHJlc3MgYW5kIHRoZQphZGRyZXNzIG9mIHRoZSBDYW1wYWlnbiBSZWdpc3RyeSBjb250cmFjdC4KClRoZSB2YXVsdCBzdGFydHMgaW4gKipvcGVuIG1vZGUqKiAoYGF1dGhvcml6ZWRfcm91dGVyID0gTm9uZWApLiBUaGUgYWRtaW4KY2FuIGxhdGVyIGNhbGwgYHNldF9hdXRob3JpemVkX3JvdXRlcmAgdG8gcmVzdHJpY3QgZGVwb3NpdHMgdG8gYSBzcGVjaWZpYwpkb25hdGlvbiByb3V0ZXIuCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBUaGUgYWRkcmVzcyBhdXRob3JpemVkIHRvIHZhbGlkYXRlIGV2aWRlbmNlIGFuZCByZWxlYXNlIGZ1bmRzLgoqIGBjYW1wYWlnbl9yZWdpc3RyeWAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgZGVwbG95ZWQgYGNhbXBhaWduLXJlZ2lzdHJ5YCBjb250cmFjdC4KCiMgRXJyb3JzCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNvbnRyYWN0IGhhcyBhbHJlYWR5IGJlZW4gaW5pdGlhbGl6ZWQuAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAARY2FtcGFpZ25fcmVnaXN0cnkAAAAAAAATAAAAAA==",
        "AAAAAAAAAh1SZWxlYXNlcyB0aGUgZmluYWwgbWlsZXN0b25lIGFtb3VudCB0byB0aGUgbm9ucHJvZml0IGFmdGVyIGV2aWRlbmNlIHZhbGlkYXRpb24uCgojIEFyZ3VtZW50cwoqIGBjYW1wYWlnbl9pZGAgLSBUaGUgSUQgb2YgdGhlIGNhbXBhaWduLgoqIGBhZG1pbmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgYWRtaW4gdmFsaWRhdGluZyB0aGUgZXZpZGVuY2UuCgojIEF1dGhvcml6YXRpb24KT25seSB0aGUgYGFkbWluYCBjb25maWd1cmVkIGluIHRoZSBjb25zdHJ1Y3RvciBjYW4gY2FsbCB0aGlzIGZ1bmN0aW9uLgoKIyBFcnJvcnMKKiBgTm90VmF1bHRBZG1pbmAgaWYgdGhlIGNhbGxlciBpcyBub3QgdGhlIGNvbmZpZ3VyZWQgYWRtaW4uCiogYENhbXBhaWduTm90Rm91bmRgIGlmIG5vIHZhdWx0IGV4aXN0cyBmb3IgdGhlIGNhbXBhaWduLgoqIGBGaW5hbEFscmVhZHlSZWxlYXNlZGAgaWYgdGhlIGZpbmFsIHJlbGVhc2UgaGFzIGFscmVhZHkgb2NjdXJyZWQuCiogYEV2aWRlbmNlTm90U3VibWl0dGVkYCBpZiBubyBldmlkZW5jZSBoYXMgYmVlbiBzdWJtaXR0ZWQuAAAAAAAADXJlbGVhc2VfZmluYWwAAAAAAAACAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAodTdWJtaXRzIGV2aWRlbmNlIGZvciB0aGUgZmluYWwgbWlsZXN0b25lLgoKIyBBcmd1bWVudHMKKiBgY2FtcGFpZ25faWRgIC0gVGhlIElEIG9mIHRoZSBjYW1wYWlnbi4KKiBgbm9ucHJvZml0YCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBub25wcm9maXQgc3VibWl0dGluZyBldmlkZW5jZS4KKiBgZXZpZGVuY2VfaGFzaGAgLSBBIG5vbi1lbXB0eSBoYXNoIG9mIHRoZSBldmlkZW5jZSAoZS5nLiwgSVBGUyBDSUQpLgoKIyBBdXRob3JpemF0aW9uClRoZSBgbm9ucHJvZml0YCBhZGRyZXNzIG11c3QgYXV0aG9yaXplIHRoaXMgY2FsbCBhbmQgbWF0Y2ggdGhlIHZhdWx0IG93bmVyLgoKIyBFcnJvcnMKKiBgQ2FtcGFpZ25Ob3RGb3VuZGAgaWYgbm8gdmF1bHQgZXhpc3RzIGZvciB0aGUgY2FtcGFpZ24uCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNhbGxlciBpcyBub3QgdGhlIGNhbXBhaWduJ3Mgbm9ucHJvZml0LgoqIGBJbml0aWFsUmVsZWFzZU5vdERvbmVgIGlmIHRoZSBpbml0aWFsIG1pbGVzdG9uZSBoYXMgbm90IGJlZW4gcmVsZWFzZWQgeWV0LgoqIGBWYXVsdEZpbmFsaXplZGAgaWYgdGhlIGZpbmFsIHJlbGVhc2UgaGFzIGFscmVhZHkgb2NjdXJyZWQuCiogYEludmFsaWRFdmlkZW5jZWAgaWYgYGV2aWRlbmNlX2hhc2hgIGlzIGVtcHR5LgAAAAAPc3VibWl0X2V2aWRlbmNlAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAAOAAAAAA==",
        "AAAAAAAAAGRSZXR1cm5zIHRoZSBjdXJyZW50bHkgY29uZmlndXJlZCBhdXRob3JpemVkIHJvdXRlciwgaWYgYW55LgoKYE5vbmVgIG1lYW5zIHRoZSB2YXVsdCBpcyBpbiBvcGVuIG1vZGUuAAAAFWdldF9hdXRob3JpemVkX3JvdXRlcgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAiBDb25maWd1cmVzIG9yIGNsZWFycyB0aGUgYXV0aG9yaXplZCBkb25hdGlvbiByb3V0ZXIuCgpXaGVuIHNldCB0byBgU29tZShyb3V0ZXIpYCwgYGRlcG9zaXRgIHJlcXVpcmVzIGByb3V0ZXIucmVxdWlyZV9hdXRoKClgLAp3aGljaCBjbG9zZXMgdGhlIHBsYXRmb3JtLWZlZSBieXBhc3MuIFdoZW4gc2V0IHRvIGBOb25lYCwgdGhlIHZhdWx0IGlzCmluIG9wZW4gbW9kZTogYW55IGFkZHJlc3MgY2FuIGNhbGwgYGRlcG9zaXRgIGRpcmVjdGx5LgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gVGhlIGFkbWluIGFkZHJlc3MgKG11c3QgYXV0aG9yaXplKS4KKiBgcm91dGVyYCAtIGBTb21lKHJvdXRlcl9hZGRyZXNzKWAgdG8gcmVzdHJpY3QgZGVwb3NpdHMsIGBOb25lYCB0byBvcGVuLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIGBhZG1pbmAgY29uZmlndXJlZCBpbiB0aGUgY29uc3RydWN0b3IgY2FuIGNhbGwgdGhpcyBmdW5jdGlvbi4KCiMgRXJyb3JzCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNhbGxlciBpcyBub3QgdGhlIGNvbmZpZ3VyZWQgYWRtaW4uAAAAFXNldF9hdXRob3JpemVkX3JvdXRlcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAGcm91dGVyAAAAAAPoAAAAEwAAAAA=",
        "AAAABQAAADNFbWl0dGVkIHdoZW4gYSBuZXcgdmF1bHQgaXMgY3JlYXRlZCBmb3IgYSBjYW1wYWlnbi4AAAAAAAAAAAxWYXVsdENyZWF0ZWQAAAABAAAADXZhdWx0X2NyZWF0ZWQAAAAAAAADAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAD1FbWl0dGVkIHdoZW4gYSBkb25hdGlvbiBpcyBkZXBvc2l0ZWQgaW50byBhIGNhbXBhaWduJ3MgdmF1bHQuAAAAAAAAAAAAABFEb25hdGlvbkRlcG9zaXRlZAAAAAAAAAEAAAASZG9uYXRpb25fZGVwb3NpdGVkAAAAAAAEAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAFZG9ub3IAAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAPdG90YWxfZGVwb3NpdGVkAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAADtFbWl0dGVkIHdoZW4gZXZpZGVuY2UgaXMgc3VibWl0dGVkIGZvciB0aGUgZmluYWwgbWlsZXN0b25lLgAAAAAAAAAAEUV2aWRlbmNlU3VibWl0dGVkAAAAAAAAAQAAABJldmlkZW5jZV9zdWJtaXR0ZWQAAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAAAAAAAAAAANZXZpZGVuY2VfaGFzaAAAAAAAAA4AAAAAAAAAAg==",
        "AAAABQAAADhFbWl0dGVkIHdoZW4gdGhlIGZpbmFsIDUwJSBpcyByZWxlYXNlZCB0byB0aGUgbm9ucHJvZml0LgAAAAAAAAASRmluYWxGdW5kc1JlbGVhc2VkAAAAAAABAAAAFGZpbmFsX2Z1bmRzX3JlbGVhc2VkAAAAAwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAADpFbWl0dGVkIHdoZW4gdGhlIGluaXRpYWwgNTAlIGlzIHJlbGVhc2VkIHRvIHRoZSBub25wcm9maXQuAAAAAAAAAAAAFEluaXRpYWxGdW5kc1JlbGVhc2VkAAAAAQAAABZpbml0aWFsX2Z1bmRzX3JlbGVhc2VkAAAAAAADAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAI1FbWl0dGVkIHdoZW4gdGhlIGFkbWluIHVwZGF0ZXMgdGhlIGF1dGhvcml6ZWQgcm91dGVyIGNvbmZpZ3VyYXRpb24uCkEgYE5vbmVgIHZhbHVlIG1lYW5zIHRoZSB2YXVsdCBpcyBpbiBvcGVuIG1vZGUgKGRpcmVjdCBkZXBvc2l0cyBhbGxvd2VkKS4AAAAAAAAAAAAAF0F1dGhvcml6ZWRSb3V0ZXJVcGRhdGVkAAAAAAEAAAAZYXV0aG9yaXplZF9yb3V0ZXJfdXBkYXRlZAAAAAAAAAEAAAAAAAAAEWF1dGhvcml6ZWRfcm91dGVyAAAAAAAD6AAAABMAAAAAAAAAAg==",
        "AAAABAAAAS9EZWZpbmVzIHRoZSBzaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIHNtYXJ0IGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKio6IGV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsIGluZGV4ZXJzLAptb25pdG9yaW5nLCBhdWRpdCByZXBvcnRzKSByZWx5IG9uIHN0YWJsZSBkaXNjcmltaW5hbnRzLiBHYXBzIGluIHRoZSBzZXF1ZW5jZQppbmRpY2F0ZSByZXNlcnZlZCBjb2Rlcy4gTmV3IGNvZGVzIE1VU1QgYmUgYXBwZW5kZWQgYXQgdGhlIGVuZC4AAAAAAAAAAAVFcnJvcgAAAAAAABQAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAflRoZSB2YXVsdCBpcyBjb25maWd1cmVkIHdpdGggYW4gYGF1dGhvcml6ZWRfcm91dGVyYCBhbmQgdGhlIGltbWVkaWF0ZQpjYWxsZXIgaXMgbm90IHRoYXQgcm91dGVyLiBEaXJlY3QgZGVwb3NpdHMgYXJlIHJlamVjdGVkLgAAAAAAE05vdEF1dGhvcml6ZWRSb3V0ZXIAAAAAGg==",
        "AAAAAQAAAOhEZWZpbmVzIHRoZSBjdXN0b2R5IGFuZCByZWxlYXNlIHN0YXRlIGZvciBhIHNwZWNpZmljIGNhbXBhaWduJ3MgZnVuZHMuCgpJbW11dGFibGUgZmllbGRzIChgdGFyZ2V0X2Ftb3VudGAsIGBkZWFkbGluZWAsIGB0b2tlbl9hZGRyZXNzYCkgYXJlIGNhY2hlZAphdCB2YXVsdCBjcmVhdGlvbiB0byBhdm9pZCByZXBlYXRlZCBjcm9zcy1jb250cmFjdCBjYWxscyBvbiB0aGUgaG90IHBhdGgKKGBkZXBvc2l0YCkuAAAAAAAAAApWYXVsdFN0YXRlAAAAAAAJAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAPoAAAADgAAAAAAAAASZmluYWxfcmVsZWFzZV9kb25lAAAAAAABAAAAAAAAABRpbml0aWFsX3JlbGVhc2VfZG9uZQAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAADXRhcmdldF9hbW91bnQAAAAAAAALAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAPdG90YWxfZGVwb3NpdGVkAAAAAAs=" ]),
      options
    )
  }
  public readonly fromJSON = {
    deposit: this.txFromJSON<null>,
        get_vault: this.txFromJSON<VaultState>,
        create_vault: this.txFromJSON<null>,
        release_final: this.txFromJSON<null>,
        submit_evidence: this.txFromJSON<null>,
        get_authorized_router: this.txFromJSON<Option<string>>,
        set_authorized_router: this.txFromJSON<null>
  }
}