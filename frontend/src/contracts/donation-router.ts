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
   * Routes a donation through the platform.
   * 
   * # Flow
   * 1. Compute `fee_amount = gross * fee_bps / 10_000` and `net_amount = gross - fee`.
   * 2. If `fee_amount > 0`, transfer the fee from `donor` to `treasury`.
   * The token address is read from the vault's cached state.
   * 3. Forward `net_amount` to the vault via `vault.deposit(campaign_id, donor, net)`.
   * 
   * Atomicity: if any step fails, the entire transaction reverts and no
   * funds move.
   * 
   * # Arguments
   * * `campaign_id` - The ID of the campaign.
   * * `donor` - The address authorizing and paying for the donation.
   * * `amount` - The gross amount to donate (fee is deducted from this).
   * 
   * # Errors
   * * `InvalidAmount` if `amount <= 0`.
   * * `Unauthorized` if the router has not been initialized with a vault.
   * * All vault-side errors propagate unchanged (e.g. `CampaignNotFound`,
   * `CampaignExpired`, `DepositExceedsTarget`, `VaultFinalized`).
   */
  donate: ({campaign_id, donor, amount}: {campaign_id: u64, donor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current fee in basis points.
   */
  get_fee_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current treasury address.
   * 
   * # Errors
   * * `Unauthorized` if the contract has not been initialized.
   */
  get_treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a update_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the platform fee. Only callable by the admin.
   * 
   * # Arguments
   * * `admin` - The admin address (must authorize).
   * * `new_fee_bps` - The new fee in basis points. Must be <= `MAX_FEE_BPS`.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the admin.
   * * `InvalidFeeBps` if `new_fee_bps > MAX_FEE_BPS`.
   */
  update_fee_bps: ({admin, new_fee_bps}: {admin: string, new_fee_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the treasury address. Only callable by the admin.
   * 
   * # Arguments
   * * `admin` - The admin address (must authorize).
   * * `new_treasury` - The new treasury address.
   * 
   * # Errors
   * * `Unauthorized` if the caller is not the admin.
   */
  update_treasury: ({admin, new_treasury}: {admin: string, new_treasury: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
        "AAAAAAAAA1lSb3V0ZXMgYSBkb25hdGlvbiB0aHJvdWdoIHRoZSBwbGF0Zm9ybS4KCiMgRmxvdwoxLiBDb21wdXRlIGBmZWVfYW1vdW50ID0gZ3Jvc3MgKiBmZWVfYnBzIC8gMTBfMDAwYCBhbmQgYG5ldF9hbW91bnQgPSBncm9zcyAtIGZlZWAuCjIuIElmIGBmZWVfYW1vdW50ID4gMGAsIHRyYW5zZmVyIHRoZSBmZWUgZnJvbSBgZG9ub3JgIHRvIGB0cmVhc3VyeWAuClRoZSB0b2tlbiBhZGRyZXNzIGlzIHJlYWQgZnJvbSB0aGUgdmF1bHQncyBjYWNoZWQgc3RhdGUuCjMuIEZvcndhcmQgYG5ldF9hbW91bnRgIHRvIHRoZSB2YXVsdCB2aWEgYHZhdWx0LmRlcG9zaXQoY2FtcGFpZ25faWQsIGRvbm9yLCBuZXQpYC4KCkF0b21pY2l0eTogaWYgYW55IHN0ZXAgZmFpbHMsIHRoZSBlbnRpcmUgdHJhbnNhY3Rpb24gcmV2ZXJ0cyBhbmQgbm8KZnVuZHMgbW92ZS4KCiMgQXJndW1lbnRzCiogYGNhbXBhaWduX2lkYCAtIFRoZSBJRCBvZiB0aGUgY2FtcGFpZ24uCiogYGRvbm9yYCAtIFRoZSBhZGRyZXNzIGF1dGhvcml6aW5nIGFuZCBwYXlpbmcgZm9yIHRoZSBkb25hdGlvbi4KKiBgYW1vdW50YCAtIFRoZSBncm9zcyBhbW91bnQgdG8gZG9uYXRlIChmZWUgaXMgZGVkdWN0ZWQgZnJvbSB0aGlzKS4KCiMgRXJyb3JzCiogYEludmFsaWRBbW91bnRgIGlmIGBhbW91bnQgPD0gMGAuCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIHJvdXRlciBoYXMgbm90IGJlZW4gaW5pdGlhbGl6ZWQgd2l0aCBhIHZhdWx0LgoqIEFsbCB2YXVsdC1zaWRlIGVycm9ycyBwcm9wYWdhdGUgdW5jaGFuZ2VkIChlLmcuIGBDYW1wYWlnbk5vdEZvdW5kYCwKYENhbXBhaWduRXhwaXJlZGAsIGBEZXBvc2l0RXhjZWVkc1RhcmdldGAsIGBWYXVsdEZpbmFsaXplZGApLgAAAAAAAAZkb25hdGUAAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAABWRvbm9yAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAChSZXR1cm5zIHRoZSBjdXJyZW50IGZlZSBpbiBiYXNpcyBwb2ludHMuAAAAC2dldF9mZWVfYnBzAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAGpSZXR1cm5zIHRoZSBjdXJyZW50IHRyZWFzdXJ5IGFkZHJlc3MuCgojIEVycm9ycwoqIGBVbmF1dGhvcml6ZWRgIGlmIHRoZSBjb250cmFjdCBoYXMgbm90IGJlZW4gaW5pdGlhbGl6ZWQuAAAAAAAMZ2V0X3RyZWFzdXJ5AAAAAAAAAAEAAAAT",
        "AAAAAAAAAc1Jbml0aWFsaXplcyB0aGUgcm91dGVyIHdpdGggYWRtaW4sIHRyZWFzdXJ5LCB2YXVsdCwgYW5kIGZlZSBjb25maWd1cmF0aW9uLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgYXV0aG9yaXplZCB0byB1cGRhdGUgZmVlIGFuZCB0cmVhc3VyeS4KKiBgdHJlYXN1cnlgIC0gVGhlIGFkZHJlc3MgdGhhdCByZWNlaXZlcyBwbGF0Zm9ybSBmZWVzLgoqIGBjYW1wYWlnbl92YXVsdGAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgYGNhbXBhaWduLXZhdWx0YCBjb250cmFjdC4KKiBgZmVlX2Jwc2AgLSBJbml0aWFsIGZlZSBpbiBiYXNpcyBwb2ludHMuIE11c3QgYmUgPD0gYE1BWF9GRUVfQlBTYC4KCiMgRXJyb3JzCiogYFVuYXV0aG9yaXplZGAgaWYgdGhlIGNvbnRyYWN0IGhhcyBhbHJlYWR5IGJlZW4gaW5pdGlhbGl6ZWQuCiogYEludmFsaWRGZWVCcHNgIGlmIGBmZWVfYnBzID4gTUFYX0ZFRV9CUFNgLgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAADmNhbXBhaWduX3ZhdWx0AAAAAAATAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAA",
        "AAAAAAAAAShVcGRhdGVzIHRoZSBwbGF0Zm9ybSBmZWUuIE9ubHkgY2FsbGFibGUgYnkgdGhlIGFkbWluLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gVGhlIGFkbWluIGFkZHJlc3MgKG11c3QgYXV0aG9yaXplKS4KKiBgbmV3X2ZlZV9icHNgIC0gVGhlIG5ldyBmZWUgaW4gYmFzaXMgcG9pbnRzLiBNdXN0IGJlIDw9IGBNQVhfRkVFX0JQU2AuCgojIEVycm9ycwoqIGBVbmF1dGhvcml6ZWRgIGlmIHRoZSBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbi4KKiBgSW52YWxpZEZlZUJwc2AgaWYgYG5ld19mZWVfYnBzID4gTUFYX0ZFRV9CUFNgLgAAAA51cGRhdGVfZmVlX2JwcwAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtuZXdfZmVlX2JwcwAAAAAEAAAAAA==",
        "AAAAAAAAAN5VcGRhdGVzIHRoZSB0cmVhc3VyeSBhZGRyZXNzLiBPbmx5IGNhbGxhYmxlIGJ5IHRoZSBhZG1pbi4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIFRoZSBhZG1pbiBhZGRyZXNzIChtdXN0IGF1dGhvcml6ZSkuCiogYG5ld190cmVhc3VyeWAgLSBUaGUgbmV3IHRyZWFzdXJ5IGFkZHJlc3MuCgojIEVycm9ycwoqIGBVbmF1dGhvcml6ZWRgIGlmIHRoZSBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbi4AAAAAAA91cGRhdGVfdHJlYXN1cnkAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAxuZXdfdHJlYXN1cnkAAAATAAAAAA==",
        "AAAABQAAAClFbWl0dGVkIHdoZW4gdGhlIHBsYXRmb3JtIGZlZSBpcyB1cGRhdGVkLgAAAAAAAAAAAAANRmVlQnBzVXBkYXRlZAAAAAAAAAEAAAAPZmVlX2Jwc191cGRhdGVkAAAAAAIAAAAAAAAAC29sZF9mZWVfYnBzAAAAAAQAAAAAAAAAAAAAAAtuZXdfZmVlX2JwcwAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAEJFbWl0dGVkIG9uIGV2ZXJ5IHN1Y2Nlc3NmdWwgZG9uYXRpb24gcm91dGVkIHRocm91Z2ggdGhpcyBjb250cmFjdC4AAAAAAAAAAAAORG9uYXRpb25Sb3V0ZWQAAAAAAAEAAAAPZG9uYXRpb25fcm91dGVkAAAAAAUAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAAAAAAAAVkb25vcgAAAAAAABMAAAAAAAAAAAAAAAxncm9zc19hbW91bnQAAAALAAAAAAAAAAAAAAAKZmVlX2Ftb3VudAAAAAAACwAAAAAAAAAAAAAACm5ldF9hbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAC1FbWl0dGVkIHdoZW4gdGhlIHRyZWFzdXJ5IGFkZHJlc3MgaXMgdXBkYXRlZC4AAAAAAAAAAAAAD1RyZWFzdXJ5VXBkYXRlZAAAAAABAAAAEHRyZWFzdXJ5X3VwZGF0ZWQAAAACAAAAAAAAAAxvbGRfdHJlYXN1cnkAAAATAAAAAAAAAAAAAAAMbmV3X3RyZWFzdXJ5AAAAEwAAAAAAAAAC",
        "AAAABAAAAS9EZWZpbmVzIHRoZSBzaGFyZWQgZXJyb3IgY29kZXMgdXNlZCBhY3Jvc3MgYWxsIHNtYXJ0IGNvbnRyYWN0cyBpbiB0aGUgd29ya3NwYWNlLgoKRXJyb3IgY29kZXMgKiptdXN0IG5vdCBiZSByZW51bWJlcmVkKio6IGV4dGVybmFsIGNvbnN1bWVycyAoZnJvbnRlbmQsIGluZGV4ZXJzLAptb25pdG9yaW5nLCBhdWRpdCByZXBvcnRzKSByZWx5IG9uIHN0YWJsZSBkaXNjcmltaW5hbnRzLiBHYXBzIGluIHRoZSBzZXF1ZW5jZQppbmRpY2F0ZSByZXNlcnZlZCBjb2Rlcy4gTmV3IGNvZGVzIE1VU1QgYmUgYXBwZW5kZWQgYXQgdGhlIGVuZC4AAAAAAAAAAAVFcnJvcgAAAAAAABQAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAEU5vbnByb2ZpdE5vdEZvdW5kAAAAAAAAAgAAAAAAAAAUTm9ucHJvZml0Tm90QXBwcm92ZWQAAAADAAAAAAAAABpOb25wcm9maXRBbHJlYWR5UmVnaXN0ZXJlZAAAAAAABAAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAUAAAAAAAAAEUNhbXBhaWduTm90QWN0aXZlAAAAAAAABgAAAAAAAAAURXZpZGVuY2VOb3RTdWJtaXR0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACwAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAwAAAAAAAAAGkludmFsaWRNaWxlc3RvbmVQZXJjZW50YWdlAAAAAAANAAAAAAAAABRGaW5hbEFscmVhZHlSZWxlYXNlZAAAABAAAAAAAAAADU5vdFZhdWx0QWRtaW4AAAAAAAASAAAAAAAAABREZXBvc2l0RXhjZWVkc1RhcmdldAAAABMAAAAAAAAAFUNhbXBhaWduQWxyZWFkeUV4aXN0cwAAAAAAABQAAAAAAAAAFUluaXRpYWxSZWxlYXNlTm90RG9uZQAAAAAAABUAAAAAAAAAD0NhbXBhaWduRXhwaXJlZAAAAAAWAAAAAAAAAA5WYXVsdEZpbmFsaXplZAAAAAAAFwAAAAAAAAAPSW52YWxpZEV2aWRlbmNlAAAAABgAAAAAAAAADUludmFsaWRGZWVCcHMAAAAAAAAZAAAAflRoZSB2YXVsdCBpcyBjb25maWd1cmVkIHdpdGggYW4gYGF1dGhvcml6ZWRfcm91dGVyYCBhbmQgdGhlIGltbWVkaWF0ZQpjYWxsZXIgaXMgbm90IHRoYXQgcm91dGVyLiBEaXJlY3QgZGVwb3NpdHMgYXJlIHJlamVjdGVkLgAAAAAAE05vdEF1dGhvcml6ZWRSb3V0ZXIAAAAAGg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    quote: this.txFromJSON<QuoteResult>,
        donate: this.txFromJSON<null>,
        get_fee_bps: this.txFromJSON<u32>,
        get_treasury: this.txFromJSON<string>,
        update_fee_bps: this.txFromJSON<null>,
        update_treasury: this.txFromJSON<null>
  }
}