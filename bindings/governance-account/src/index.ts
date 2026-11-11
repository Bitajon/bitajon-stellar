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
 * Errors returned by the governance account.
 */
export const GovernanceError = {
  /**
   * The provided threshold is 0 or greater than the number of signers.
   */
  1: {message:"InvalidThreshold"},
  /**
   * The address is not in the signers set.
   */
  2: {message:"NotASigner"},
  /**
   * The address is already in the signers set.
   */
  3: {message:"AlreadySigner"},
  /**
   * Fewer valid signatures than the threshold were provided.
   */
  4: {message:"ThresholdNotMet"},
  /**
   * The account must have at least one signer.
   */
  5: {message:"NoSigners"}
}





export interface Client {
  /**
   * Construct and simulate a is_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if `who` is a current signer.
   */
  is_signer: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a add_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a new signer.
   * 
   * The current threshold must authorize this change, meaning the
   * transaction must carry at least `threshold` signatures from existing
   * signers.
   * 
   * # Errors
   * * `AlreadySigner` if `new_signer` is already in the set.
   */
  add_signer: ({new_signer}: {new_signer: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_signers transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current set of signers.
   */
  get_signers: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current threshold.
   */
  get_threshold: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a remove_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Removes an existing signer.
   * 
   * The current threshold must authorize this change.
   * 
   * # Auto-adjustment
   * If removing `signer` makes `threshold > signers.len()`, the threshold
   * is automatically lowered to `signers.len()` to keep the account usable.
   * A `ThresholdAutoAdjusted` event is emitted in that case.
   * 
   * # Errors
   * * `NotASigner` if `signer` is not in the set.
   * * `NoSigners` if `signer` is the last one (cannot brick the account).
   */
  remove_signer: ({signer}: {signer: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the threshold.
   * 
   * The current threshold must authorize this change. This prevents a
   * single signer from lowering the bar to authorize future actions.
   * 
   * # Errors
   * * `InvalidThreshold` if `new_threshold` is 0 or greater than the
   * current number of signers.
   */
  update_threshold: ({new_threshold}: {new_threshold: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {signers, threshold}: {signers: Array<string>, threshold: u32},
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
    return ContractClient.deploy({signers, threshold}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAACpFcnJvcnMgcmV0dXJuZWQgYnkgdGhlIGdvdmVybmFuY2UgYWNjb3VudC4AAAAAAAAAAAAPR292ZXJuYW5jZUVycm9yAAAAAAUAAABCVGhlIHByb3ZpZGVkIHRocmVzaG9sZCBpcyAwIG9yIGdyZWF0ZXIgdGhhbiB0aGUgbnVtYmVyIG9mIHNpZ25lcnMuAAAAAAAQSW52YWxpZFRocmVzaG9sZAAAAAEAAAAmVGhlIGFkZHJlc3MgaXMgbm90IGluIHRoZSBzaWduZXJzIHNldC4AAAAAAApOb3RBU2lnbmVyAAAAAAACAAAAKlRoZSBhZGRyZXNzIGlzIGFscmVhZHkgaW4gdGhlIHNpZ25lcnMgc2V0LgAAAAAADUFscmVhZHlTaWduZXIAAAAAAAADAAAAOEZld2VyIHZhbGlkIHNpZ25hdHVyZXMgdGhhbiB0aGUgdGhyZXNob2xkIHdlcmUgcHJvdmlkZWQuAAAAD1RocmVzaG9sZE5vdE1ldAAAAAAEAAAAKlRoZSBhY2NvdW50IG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgc2lnbmVyLgAAAAAACU5vU2lnbmVycwAAAAAAAAU=",
        "AAAAAAAAACxSZXR1cm5zIGB0cnVlYCBpZiBgd2hvYCBpcyBhIGN1cnJlbnQgc2lnbmVyLgAAAAlpc19zaWduZXIAAAAAAAABAAAAAAAAAAN3aG8AAAAAEwAAAAEAAAAB",
        "AAAAAAAAAOJBZGRzIGEgbmV3IHNpZ25lci4KClRoZSBjdXJyZW50IHRocmVzaG9sZCBtdXN0IGF1dGhvcml6ZSB0aGlzIGNoYW5nZSwgbWVhbmluZyB0aGUKdHJhbnNhY3Rpb24gbXVzdCBjYXJyeSBhdCBsZWFzdCBgdGhyZXNob2xkYCBzaWduYXR1cmVzIGZyb20gZXhpc3RpbmcKc2lnbmVycy4KCiMgRXJyb3JzCiogYEFscmVhZHlTaWduZXJgIGlmIGBuZXdfc2lnbmVyYCBpcyBhbHJlYWR5IGluIHRoZSBzZXQuAAAAAAAKYWRkX3NpZ25lcgAAAAAAAQAAAAAAAAAKbmV3X3NpZ25lcgAAAAAAEwAAAAA=",
        "AAAAAAAAACNSZXR1cm5zIHRoZSBjdXJyZW50IHNldCBvZiBzaWduZXJzLgAAAAALZ2V0X3NpZ25lcnMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAVtJbml0aWFsaXplcyB0aGUgZ292ZXJuYW5jZSBhY2NvdW50IHdpdGggYW4gaW5pdGlhbCBzZXQgb2Ygc2lnbmVycwphbmQgYSB0aHJlc2hvbGQuCgojIEFyZ3VtZW50cwoqIGBzaWduZXJzYCAtIEluaXRpYWwgc2V0IG9mIGF1dGhvcml6ZWQgc2lnbmVycy4gTXVzdCBiZSBub24tZW1wdHkuCiogYHRocmVzaG9sZGAgLSBNaW5pbXVtIG51bWJlciBvZiBzaWduYXR1cmVzIHJlcXVpcmVkLiBNdXN0IGJlCmAxLi49c2lnbmVycy5sZW4oKWAuCgojIEVycm9ycwoqIGBOb1NpZ25lcnNgIGlmIGBzaWduZXJzYCBpcyBlbXB0eS4KKiBgSW52YWxpZFRocmVzaG9sZGAgaWYgYHRocmVzaG9sZGAgaXMgb3V0IG9mIHJhbmdlLgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAAB3NpZ25lcnMAAAAD6gAAABMAAAAAAAAACXRocmVzaG9sZAAAAAAAAAQAAAAA",
        "AAAAAAAAAB5SZXR1cm5zIHRoZSBjdXJyZW50IHRocmVzaG9sZC4AAAAAAA1nZXRfdGhyZXNob2xkAAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAaZSZW1vdmVzIGFuIGV4aXN0aW5nIHNpZ25lci4KClRoZSBjdXJyZW50IHRocmVzaG9sZCBtdXN0IGF1dGhvcml6ZSB0aGlzIGNoYW5nZS4KCiMgQXV0by1hZGp1c3RtZW50CklmIHJlbW92aW5nIGBzaWduZXJgIG1ha2VzIGB0aHJlc2hvbGQgPiBzaWduZXJzLmxlbigpYCwgdGhlIHRocmVzaG9sZAppcyBhdXRvbWF0aWNhbGx5IGxvd2VyZWQgdG8gYHNpZ25lcnMubGVuKClgIHRvIGtlZXAgdGhlIGFjY291bnQgdXNhYmxlLgpBIGBUaHJlc2hvbGRBdXRvQWRqdXN0ZWRgIGV2ZW50IGlzIGVtaXR0ZWQgaW4gdGhhdCBjYXNlLgoKIyBFcnJvcnMKKiBgTm90QVNpZ25lcmAgaWYgYHNpZ25lcmAgaXMgbm90IGluIHRoZSBzZXQuCiogYE5vU2lnbmVyc2AgaWYgYHNpZ25lcmAgaXMgdGhlIGxhc3Qgb25lIChjYW5ub3QgYnJpY2sgdGhlIGFjY291bnQpLgAAAAAADXJlbW92ZV9zaWduZXIAAAAAAAABAAAAAAAAAAZzaWduZXIAAAAAABMAAAAA",
        "AAAAAAAAAQBVcGRhdGVzIHRoZSB0aHJlc2hvbGQuCgpUaGUgY3VycmVudCB0aHJlc2hvbGQgbXVzdCBhdXRob3JpemUgdGhpcyBjaGFuZ2UuIFRoaXMgcHJldmVudHMgYQpzaW5nbGUgc2lnbmVyIGZyb20gbG93ZXJpbmcgdGhlIGJhciB0byBhdXRob3JpemUgZnV0dXJlIGFjdGlvbnMuCgojIEVycm9ycwoqIGBJbnZhbGlkVGhyZXNob2xkYCBpZiBgbmV3X3RocmVzaG9sZGAgaXMgMCBvciBncmVhdGVyIHRoYW4gdGhlCmN1cnJlbnQgbnVtYmVyIG9mIHNpZ25lcnMuAAAAEHVwZGF0ZV90aHJlc2hvbGQAAAABAAAAAAAAAA1uZXdfdGhyZXNob2xkAAAAAAAABAAAAAA=",
        "AAAABQAAAD1FbWl0dGVkIHdoZW4gYSBuZXcgc2lnbmVyIGlzIGFkZGVkIHRvIHRoZSBnb3Zlcm5hbmNlIGFjY291bnQuAAAAAAAAAAAAAAtTaWduZXJBZGRlZAAAAAABAAAADHNpZ25lcl9hZGRlZAAAAAEAAAAAAAAABnNpZ25lcgAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAD1FbWl0dGVkIHdoZW4gYSBzaWduZXIgaXMgcmVtb3ZlZCBmcm9tIHRoZSBnb3Zlcm5hbmNlIGFjY291bnQuAAAAAAAAAAAAAA1TaWduZXJSZW1vdmVkAAAAAAAAAQAAAA5zaWduZXJfcmVtb3ZlZAAAAAAAAQAAAAAAAAAGc2lnbmVyAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAACZFbWl0dGVkIHdoZW4gdGhlIHRocmVzaG9sZCBpcyB1cGRhdGVkLgAAAAAAAAAAABBUaHJlc2hvbGRVcGRhdGVkAAAAAQAAABF0aHJlc2hvbGRfdXBkYXRlZAAAAAAAAAIAAAAAAAAADW9sZF90aHJlc2hvbGQAAAAAAAAEAAAAAAAAAAAAAAANbmV3X3RocmVzaG9sZAAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAG1FbWl0dGVkIHdoZW4gcmVtb3ZpbmcgYSBzaWduZXIgZm9yY2VkIHRoZSB0aHJlc2hvbGQgdG8gYmUgbG93ZXJlZAphdXRvbWF0aWNhbGx5ICh0byBrZWVwIHRoZSBhY2NvdW50IHVzYWJsZSkuAAAAAAAAAAAAABVUaHJlc2hvbGRBdXRvQWRqdXN0ZWQAAAAAAAABAAAAF3RocmVzaG9sZF9hdXRvX2FkanVzdGVkAAAAAAIAAAAAAAAADW9sZF90aHJlc2hvbGQAAAAAAAAEAAAAAAAAAAAAAAANbmV3X3RocmVzaG9sZAAAAAAAAAQAAAAAAAAAAg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    is_signer: this.txFromJSON<boolean>,
        add_signer: this.txFromJSON<null>,
        get_signers: this.txFromJSON<Array<string>>,
        get_threshold: this.txFromJSON<u32>,
        remove_signer: this.txFromJSON<null>,
        update_threshold: this.txFromJSON<null>
  }
}