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
 * Represents the metadata and financial goal of a specific fundraising campaign.
 */
export interface Campaign {
  deadline: u64;
  description: string;
  location: string;
  milestone_percentage: u32;
  name: string;
  nonprofit: string;
  status: CampaignStatus;
  target_amount: i128;
  token_address: string;
}

/**
 * Defines the lifecycle states of a fundraising campaign.
 */
export type CampaignStatus = {tag: "Active", values: void} | {tag: "Completed", values: void} | {tag: "Cancelled", values: void};

export interface Client {
  /**
   * Construct and simulate a get_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves the metadata of a specific campaign.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign.
   * 
   * # Returns
   * The `Campaign` struct.
   * 
   * # Errors
   * * `CampaignNotFound` if the campaign does not exist.
   */
  get_campaign: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Campaign>>

  /**
   * Construct and simulate a cancel_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancels an active campaign.
   * 
   * # Arguments
   * * `nonprofit` - The address of the nonprofit that owns the campaign.
   * * `campaign_id` - The ID of the campaign to cancel.
   * 
   * # Authorization
   * Only the nonprofit that created the campaign can cancel it.
   * 
   * # Errors
   * * `CampaignNotFound` if the campaign does not exist.
   * * `Unauthorized` if the caller is not the owner.
   * * `CampaignNotActive` if the campaign is not in `Active` status.
   */
  cancel_campaign: ({nonprofit, campaign_id}: {nonprofit: string, campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a new fundraising campaign.
   * 
   * # Arguments
   * * `nonprofit` - The address of the nonprofit creating the campaign.
   * * `name` - The campaign name.
   * * `description` - A description of the campaign.
   * * `location` - The geographic location of the campaign.
   * * `target_amount` - The funding goal in the smallest unit of the token.
   * * `token_address` - The Stellar Asset Contract (SAC) address of the stablecoin.
   * * `deadline` - The Unix timestamp after which the campaign expires.
   * * `milestone_percentage` - The percentage of funds released upon reaching
   * the target (e.g., 50 for 50%). If 0, `DEFAULT_MILESTONE_PERCENTAGE` is used.
   * 
   * # Authorization
   * The `nonprofit` address must authorize this call and be approved in the
   * `nonprofit-registry` contract.
   * 
   * # Returns
   * The newly assigned campaign ID.
   * 
   * # Errors
   * * `InvalidAmount` if the target amount is not strictly positive.
   * * `InvalidDeadline` if the deadline is not in the future.
   * * `InvalidMilestonePercentage` if the milestone percentage exceeds 100.
   * * `NonprofitNotApproved` if the n
   */
  create_campaign: ({nonprofit, name, description, location, target_amount, token_address, deadline, milestone_percentage}: {nonprofit: string, name: string, description: string, location: string, target_amount: i128, token_address: string, deadline: u64, milestone_percentage: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

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
      new ContractSpec([ "AAAAAAAAAMZSZXRyaWV2ZXMgdGhlIG1ldGFkYXRhIG9mIGEgc3BlY2lmaWMgY2FtcGFpZ24uCgojIEFyZ3VtZW50cwoqIGBjYW1wYWlnbl9pZGAgLSBUaGUgSUQgb2YgdGhlIGNhbXBhaWduLgoKIyBSZXR1cm5zClRoZSBgQ2FtcGFpZ25gIHN0cnVjdC4KCiMgRXJyb3JzCiogYENhbXBhaWduTm90Rm91bmRgIGlmIHRoZSBjYW1wYWlnbiBkb2VzIG5vdCBleGlzdC4AAAAAAAxnZXRfY2FtcGFpZ24AAAABAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAB9AAAAAIQ2FtcGFpZ24=",
        "AAAAAAAAAXFJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbmlzdHJhdG9yIGFkZHJlc3MgYW5kIHRoZQphZGRyZXNzIG9mIHRoZSBOb25wcm9maXQgUmVnaXN0cnkgY29udHJhY3QuCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBUaGUgYWRkcmVzcyBhdXRob3JpemVkIHRvIG1hbmFnZSB0aGUgcmVnaXN0cnkuCiogYG5vbnByb2ZpdF9yZWdpc3RyeWAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgZGVwbG95ZWQgYG5vbnByb2ZpdC1yZWdpc3RyeWAKY29udHJhY3QsIHVzZWQgZm9yIHZhbGlkYXRpbmcgbm9ucHJvZml0IGxlZ2l0aW1hY3kuCgojIEVycm9ycwoqIFBhbmljcyBpZiB0aGUgY29udHJhY3QgaGFzIGFscmVhZHkgYmVlbiBpbml0aWFsaXplZC4AAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAASbm9ucHJvZml0X3JlZ2lzdHJ5AAAAAAATAAAAAA==",
        "AAAAAAAAAZ9DYW5jZWxzIGFuIGFjdGl2ZSBjYW1wYWlnbi4KCiMgQXJndW1lbnRzCiogYG5vbnByb2ZpdGAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgbm9ucHJvZml0IHRoYXQgb3ducyB0aGUgY2FtcGFpZ24uCiogYGNhbXBhaWduX2lkYCAtIFRoZSBJRCBvZiB0aGUgY2FtcGFpZ24gdG8gY2FuY2VsLgoKIyBBdXRob3JpemF0aW9uCk9ubHkgdGhlIG5vbnByb2ZpdCB0aGF0IGNyZWF0ZWQgdGhlIGNhbXBhaWduIGNhbiBjYW5jZWwgaXQuCgojIEVycm9ycwoqIGBDYW1wYWlnbk5vdEZvdW5kYCBpZiB0aGUgY2FtcGFpZ24gZG9lcyBub3QgZXhpc3QuCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNhbGxlciBpcyBub3QgdGhlIG93bmVyLgoqIGBDYW1wYWlnbk5vdEFjdGl2ZWAgaWYgdGhlIGNhbXBhaWduIGlzIG5vdCBpbiBgQWN0aXZlYCBzdGF0dXMuAAAAAA9jYW5jZWxfY2FtcGFpZ24AAAAAAgAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAA=",
        "AAAAAAAABABDcmVhdGVzIGEgbmV3IGZ1bmRyYWlzaW5nIGNhbXBhaWduLgoKIyBBcmd1bWVudHMKKiBgbm9ucHJvZml0YCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBub25wcm9maXQgY3JlYXRpbmcgdGhlIGNhbXBhaWduLgoqIGBuYW1lYCAtIFRoZSBjYW1wYWlnbiBuYW1lLgoqIGBkZXNjcmlwdGlvbmAgLSBBIGRlc2NyaXB0aW9uIG9mIHRoZSBjYW1wYWlnbi4KKiBgbG9jYXRpb25gIC0gVGhlIGdlb2dyYXBoaWMgbG9jYXRpb24gb2YgdGhlIGNhbXBhaWduLgoqIGB0YXJnZXRfYW1vdW50YCAtIFRoZSBmdW5kaW5nIGdvYWwgaW4gdGhlIHNtYWxsZXN0IHVuaXQgb2YgdGhlIHRva2VuLgoqIGB0b2tlbl9hZGRyZXNzYCAtIFRoZSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0IChTQUMpIGFkZHJlc3Mgb2YgdGhlIHN0YWJsZWNvaW4uCiogYGRlYWRsaW5lYCAtIFRoZSBVbml4IHRpbWVzdGFtcCBhZnRlciB3aGljaCB0aGUgY2FtcGFpZ24gZXhwaXJlcy4KKiBgbWlsZXN0b25lX3BlcmNlbnRhZ2VgIC0gVGhlIHBlcmNlbnRhZ2Ugb2YgZnVuZHMgcmVsZWFzZWQgdXBvbiByZWFjaGluZwp0aGUgdGFyZ2V0IChlLmcuLCA1MCBmb3IgNTAlKS4gSWYgMCwgYERFRkFVTFRfTUlMRVNUT05FX1BFUkNFTlRBR0VgIGlzIHVzZWQuCgojIEF1dGhvcml6YXRpb24KVGhlIGBub25wcm9maXRgIGFkZHJlc3MgbXVzdCBhdXRob3JpemUgdGhpcyBjYWxsIGFuZCBiZSBhcHByb3ZlZCBpbiB0aGUKYG5vbnByb2ZpdC1yZWdpc3RyeWAgY29udHJhY3QuCgojIFJldHVybnMKVGhlIG5ld2x5IGFzc2lnbmVkIGNhbXBhaWduIElELgoKIyBFcnJvcnMKKiBgSW52YWxpZEFtb3VudGAgaWYgdGhlIHRhcmdldCBhbW91bnQgaXMgbm90IHN0cmljdGx5IHBvc2l0aXZlLgoqIGBJbnZhbGlkRGVhZGxpbmVgIGlmIHRoZSBkZWFkbGluZSBpcyBub3QgaW4gdGhlIGZ1dHVyZS4KKiBgSW52YWxpZE1pbGVzdG9uZVBlcmNlbnRhZ2VgIGlmIHRoZSBtaWxlc3RvbmUgcGVyY2VudGFnZSBleGNlZWRzIDEwMC4KKiBgTm9ucHJvZml0Tm90QXBwcm92ZWRgIGlmIHRoZSBuAAAAD2NyZWF0ZV9jYW1wYWlnbgAAAAAIAAAAAAAAAAlub25wcm9maXQAAAAAAAATAAAAAAAAAARuYW1lAAAAEAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIbG9jYXRpb24AAAAQAAAAAAAAAA10YXJnZXRfYW1vdW50AAAAAAAACwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAAUbWlsZXN0b25lX3BlcmNlbnRhZ2UAAAAEAAAAAQAAAAY=",
        "AAAABQAAACdFbWl0dGVkIHdoZW4gYSBuZXcgY2FtcGFpZ24gaXMgY3JlYXRlZC4AAAAAAAAAAA9DYW1wYWlnbkNyZWF0ZWQAAAAAAQAAABBjYW1wYWlnbl9jcmVhdGVkAAAABAAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAAAAAACW5vbnByb2ZpdAAAAAAAABMAAAAAAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAAAAAADXRhcmdldF9hbW91bnQAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAACVFbWl0dGVkIHdoZW4gYSBjYW1wYWlnbiBpcyBjYW5jZWxsZWQuAAAAAAAAAAAAABFDYW1wYWlnbkNhbmNlbGxlZAAAAAAAAAEAAAASY2FtcGFpZ25fY2FuY2VsbGVkAAAAAAACAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAAC",
        "AAAABAAAAS9EZWZpbmVzIHRoZSBzaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIHNtYXJ0IGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKio6IGV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsIGluZGV4ZXJzLAptb25pdG9yaW5nLCBhdWRpdCByZXBvcnRzKSByZWx5IG9uIHN0YWJsZSBkaXNjcmltaW5hbnRzLiBHYXBzIGluIHRoZSBzZXF1ZW5jZQppbmRpY2F0ZSByZXNlcnZlZCBjb2Rlcy4gTmV3IGNvZGVzIE1VU1QgYmUgYXBwZW5kZWQgYXQgdGhlIGVuZC4AAAAAAAAAAAVFcnJvcgAAAAAAABQAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAflRoZSB2YXVsdCBpcyBjb25maWd1cmVkIHdpdGggYW4gYGF1dGhvcml6ZWRfcm91dGVyYCBhbmQgdGhlIGltbWVkaWF0ZQpjYWxsZXIgaXMgbm90IHRoYXQgcm91dGVyLiBEaXJlY3QgZGVwb3NpdHMgYXJlIHJlamVjdGVkLgAAAAAAE05vdEF1dGhvcml6ZWRSb3V0ZXIAAAAAGg==",
        "AAAAAQAAAE5SZXByZXNlbnRzIHRoZSBtZXRhZGF0YSBhbmQgZmluYW5jaWFsIGdvYWwgb2YgYSBzcGVjaWZpYyBmdW5kcmFpc2luZyBjYW1wYWlnbi4AAAAAAAAAAAAIQ2FtcGFpZ24AAAAJAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAACGxvY2F0aW9uAAAAEAAAAAAAAAAUbWlsZXN0b25lX3BlcmNlbnRhZ2UAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAJbm9ucHJvZml0AAAAAAAAEwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADkNhbXBhaWduU3RhdHVzAAAAAAAAAAAADXRhcmdldF9hbW91bnQAAAAAAAALAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEw==",
        "AAAAAgAAADdEZWZpbmVzIHRoZSBsaWZlY3ljbGUgc3RhdGVzIG9mIGEgZnVuZHJhaXNpbmcgY2FtcGFpZ24uAAAAAAAAAAAOQ2FtcGFpZ25TdGF0dXMAAAAAAAMAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACUNvbXBsZXRlZAAAAAAAAAAAAAAAAAAACUNhbmNlbGxlZAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_campaign: this.txFromJSON<Campaign>,
        cancel_campaign: this.txFromJSON<null>,
        create_campaign: this.txFromJSON<u64>
  }
}