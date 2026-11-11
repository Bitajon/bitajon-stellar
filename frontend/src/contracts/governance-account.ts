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
 * A single signature submitted for authorization.
 */
export interface SignerProof {
  public_key: Buffer;
  signature: Buffer;
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
   * The public key is not in the signers set.
   */
  2: {message:"NotASigner"},
  /**
   * The public key is already in the signers set.
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





/**
 * Contract executable used for creating a new contract and used in
 * `CreateContractHostFnContext`.
 */
export type ContractExecutable = {tag: "Wasm", values: readonly [Buffer]} | {tag: "ExternalRef", values: readonly [ContractExecutableRef]};


/**
 * Executable referenced via a persistent storage entry owned by a contract,
 * either this contract or another contract.
 * 
 * The persistent storage entry owned by the `owner` has the `tag` as its key.
 */
export interface ContractExecutableRef {
  owner: string;
  tag: string;
}

/**
 * Context of a single authorized call performed by an address.
 * 
 * Custom account contracts that implement `__check_auth` special function
 * receive a list of `Context` values corresponding to all the calls that
 * need to be authorized.
 */
export type Context = {tag: "Contract", values: readonly [ContractContext]} | {tag: "CreateContractHostFn", values: readonly [CreateContractHostFnContext]} | {tag: "CreateContractWithCtorHostFn", values: readonly [CreateContractWithConstructorHostFnContext]};


/**
 * Authorization context of a single contract call.
 * 
 * This struct corresponds to a `require_auth_for_args` call for an address
 * from `contract` function with `fn_name` name and `args` arguments.
 */
export interface ContractContext {
  args: Array<any>;
  contract: string;
  fn_name: string;
}


/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 */
export interface CreateContractHostFnContext {
  executable: ContractExecutable;
  salt: Buffer;
}


/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 * This is the same as `CreateContractHostFnContext`, but also has
 * contract constructor arguments.
 */
export interface CreateContractWithConstructorHostFnContext {
  constructor_args: Array<any>;
  executable: ContractExecutable;
  salt: Buffer;
}

export interface Client {
  /**
   * Construct and simulate a is_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if `public_key` is a current signer.
   */
  is_signer: ({public_key}: {public_key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a add_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a new signer.
   * 
   * The current threshold must authorize this change.
   * 
   * # Errors
   * * `AlreadySigner` if the public key is already in the set.
   */
  add_signer: ({new_signer}: {new_signer: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_signers transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current set of signer public keys.
   */
  get_signers: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Buffer>>>

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
   * * `NotASigner` if the public key is not in the set.
   * * `NoSigners` if `signer` is the last one (cannot brick the account).
   */
  remove_signer: ({signer}: {signer: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the threshold.
   * 
   * The current threshold must authorize this change.
   * 
   * # Errors
   * * `InvalidThreshold` if `new_threshold` is 0 or greater than the
   * current number of signers.
   */
  update_threshold: ({new_threshold}: {new_threshold: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a verify_signatures transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verifies a set of `SignerProof` against the current signers and
   * threshold.
   * 
   * This is a pure read-only helper exposed both for off-chain pre-checks
   * and for tests. It does not mutate state. It returns `Ok(())` when the
   * proofs meet the threshold, `ThresholdNotMet` when they do not, and
   * panics (host trap) when any provided signature is cryptographically
   * invalid for the payload.
   * 
   * `signature_payload` is the 32-byte hash of the
   * `HashIdPreimage::SorobanAuthorization` envelope, exactly as
   * `__check_auth` receives it.
   */
  verify_signatures: ({signature_payload, signatures}: {signature_payload: Buffer, signatures: Array<SignerProof>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {signers, threshold}: {signers: Array<Buffer>, threshold: u32},
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
      new ContractSpec([ "AAAAAQAAAC9BIHNpbmdsZSBzaWduYXR1cmUgc3VibWl0dGVkIGZvciBhdXRob3JpemF0aW9uLgAAAAAAAAAAC1NpZ25lclByb29mAAAAAAIAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAAAgAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQA==",
        "AAAABAAAACpFcnJvcnMgcmV0dXJuZWQgYnkgdGhlIGdvdmVybmFuY2UgYWNjb3VudC4AAAAAAAAAAAAPR292ZXJuYW5jZUVycm9yAAAAAAUAAABCVGhlIHByb3ZpZGVkIHRocmVzaG9sZCBpcyAwIG9yIGdyZWF0ZXIgdGhhbiB0aGUgbnVtYmVyIG9mIHNpZ25lcnMuAAAAAAAQSW52YWxpZFRocmVzaG9sZAAAAAEAAAApVGhlIHB1YmxpYyBrZXkgaXMgbm90IGluIHRoZSBzaWduZXJzIHNldC4AAAAAAAAKTm90QVNpZ25lcgAAAAAAAgAAAC1UaGUgcHVibGljIGtleSBpcyBhbHJlYWR5IGluIHRoZSBzaWduZXJzIHNldC4AAAAAAAANQWxyZWFkeVNpZ25lcgAAAAAAAAMAAAA4RmV3ZXIgdmFsaWQgc2lnbmF0dXJlcyB0aGFuIHRoZSB0aHJlc2hvbGQgd2VyZSBwcm92aWRlZC4AAAAPVGhyZXNob2xkTm90TWV0AAAAAAQAAAAqVGhlIGFjY291bnQgbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBzaWduZXIuAAAAAAAJTm9TaWduZXJzAAAAAAAABQ==",
        "AAAAAAAAADNSZXR1cm5zIGB0cnVlYCBpZiBgcHVibGljX2tleWAgaXMgYSBjdXJyZW50IHNpZ25lci4AAAAACWlzX3NpZ25lcgAAAAAAAAEAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAIpBZGRzIGEgbmV3IHNpZ25lci4KClRoZSBjdXJyZW50IHRocmVzaG9sZCBtdXN0IGF1dGhvcml6ZSB0aGlzIGNoYW5nZS4KCiMgRXJyb3JzCiogYEFscmVhZHlTaWduZXJgIGlmIHRoZSBwdWJsaWMga2V5IGlzIGFscmVhZHkgaW4gdGhlIHNldC4AAAAAAAphZGRfc2lnbmVyAAAAAAABAAAAAAAAAApuZXdfc2lnbmVyAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAC5SZXR1cm5zIHRoZSBjdXJyZW50IHNldCBvZiBzaWduZXIgcHVibGljIGtleXMuAAAAAAALZ2V0X3NpZ25lcnMAAAAAAAAAAAEAAAPqAAAD7gAAACA=",
        "AAAAAAAAAAAAAAAMX19jaGVja19hdXRoAAAAAwAAAAAAAAARc2lnbmF0dXJlX3BheWxvYWQAAAAAAAPuAAAAIAAAAAAAAAAKc2lnbmF0dXJlcwAAAAAD6gAAB9AAAAALU2lnbmVyUHJvb2YAAAAAAAAAAA1hdXRoX2NvbnRleHRzAAAAAAAD6gAAB9AAAAAHQ29udGV4dAAAAAABAAAD6QAAAAIAAAfQAAAAD0dvdmVybmFuY2VFcnJvcgA=",
        "AAAAAAAAAVlJbml0aWFsaXplcyB0aGUgZ292ZXJuYW5jZSBhY2NvdW50IHdpdGggYW4gaW5pdGlhbCBzZXQgb2Ygc2lnbmVycwphbmQgYSB0aHJlc2hvbGQuCgojIEFyZ3VtZW50cwoqIGBzaWduZXJzYCAtIEluaXRpYWwgc2V0IG9mIEVkMjU1MTkgcHVibGljIGtleXMuIE11c3QgYmUgbm9uLWVtcHR5LgoqIGB0aHJlc2hvbGRgIC0gTWluaW11bSBudW1iZXIgb2YgdmFsaWQgc2lnbmF0dXJlcy4gTXVzdCBiZQpgMS4uPXNpZ25lcnMubGVuKClgLgoKIyBFcnJvcnMKKiBgTm9TaWduZXJzYCBpZiBgc2lnbmVyc2AgaXMgZW1wdHkuCiogYEludmFsaWRUaHJlc2hvbGRgIGlmIGB0aHJlc2hvbGRgIGlzIG91dCBvZiByYW5nZS4AAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAAB3NpZ25lcnMAAAAD6gAAA+4AAAAgAAAAAAAAAAl0aHJlc2hvbGQAAAAAAAAEAAAAAA==",
        "AAAAAAAAAB5SZXR1cm5zIHRoZSBjdXJyZW50IHRocmVzaG9sZC4AAAAAAA1nZXRfdGhyZXNob2xkAAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAaxSZW1vdmVzIGFuIGV4aXN0aW5nIHNpZ25lci4KClRoZSBjdXJyZW50IHRocmVzaG9sZCBtdXN0IGF1dGhvcml6ZSB0aGlzIGNoYW5nZS4KCiMgQXV0by1hZGp1c3RtZW50CklmIHJlbW92aW5nIGBzaWduZXJgIG1ha2VzIGB0aHJlc2hvbGQgPiBzaWduZXJzLmxlbigpYCwgdGhlIHRocmVzaG9sZAppcyBhdXRvbWF0aWNhbGx5IGxvd2VyZWQgdG8gYHNpZ25lcnMubGVuKClgIHRvIGtlZXAgdGhlIGFjY291bnQgdXNhYmxlLgpBIGBUaHJlc2hvbGRBdXRvQWRqdXN0ZWRgIGV2ZW50IGlzIGVtaXR0ZWQgaW4gdGhhdCBjYXNlLgoKIyBFcnJvcnMKKiBgTm90QVNpZ25lcmAgaWYgdGhlIHB1YmxpYyBrZXkgaXMgbm90IGluIHRoZSBzZXQuCiogYE5vU2lnbmVyc2AgaWYgYHNpZ25lcmAgaXMgdGhlIGxhc3Qgb25lIChjYW5ub3QgYnJpY2sgdGhlIGFjY291bnQpLgAAAA1yZW1vdmVfc2lnbmVyAAAAAAAAAQAAAAAAAAAGc2lnbmVyAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAK9VcGRhdGVzIHRoZSB0aHJlc2hvbGQuCgpUaGUgY3VycmVudCB0aHJlc2hvbGQgbXVzdCBhdXRob3JpemUgdGhpcyBjaGFuZ2UuCgojIEVycm9ycwoqIGBJbnZhbGlkVGhyZXNob2xkYCBpZiBgbmV3X3RocmVzaG9sZGAgaXMgMCBvciBncmVhdGVyIHRoYW4gdGhlCmN1cnJlbnQgbnVtYmVyIG9mIHNpZ25lcnMuAAAAABB1cGRhdGVfdGhyZXNob2xkAAAAAQAAAAAAAAANbmV3X3RocmVzaG9sZAAAAAAAAAQAAAAA",
        "AAAAAAAAAf9WZXJpZmllcyBhIHNldCBvZiBgU2lnbmVyUHJvb2ZgIGFnYWluc3QgdGhlIGN1cnJlbnQgc2lnbmVycyBhbmQKdGhyZXNob2xkLgoKVGhpcyBpcyBhIHB1cmUgcmVhZC1vbmx5IGhlbHBlciBleHBvc2VkIGJvdGggZm9yIG9mZi1jaGFpbiBwcmUtY2hlY2tzCmFuZCBmb3IgdGVzdHMuIEl0IGRvZXMgbm90IG11dGF0ZSBzdGF0ZS4gSXQgcmV0dXJucyBgT2soKCkpYCB3aGVuIHRoZQpwcm9vZnMgbWVldCB0aGUgdGhyZXNob2xkLCBgVGhyZXNob2xkTm90TWV0YCB3aGVuIHRoZXkgZG8gbm90LCBhbmQKcGFuaWNzIChob3N0IHRyYXApIHdoZW4gYW55IHByb3ZpZGVkIHNpZ25hdHVyZSBpcyBjcnlwdG9ncmFwaGljYWxseQppbnZhbGlkIGZvciB0aGUgcGF5bG9hZC4KCmBzaWduYXR1cmVfcGF5bG9hZGAgaXMgdGhlIDMyLWJ5dGUgaGFzaCBvZiB0aGUKYEhhc2hJZFByZWltYWdlOjpTb3JvYmFuQXV0aG9yaXphdGlvbmAgZW52ZWxvcGUsIGV4YWN0bHkgYXMKYF9fY2hlY2tfYXV0aGAgcmVjZWl2ZXMgaXQuAAAAABF2ZXJpZnlfc2lnbmF0dXJlcwAAAAAAAAIAAAAAAAAAEXNpZ25hdHVyZV9wYXlsb2FkAAAAAAAD7gAAACAAAAAAAAAACnNpZ25hdHVyZXMAAAAAA+oAAAfQAAAAC1NpZ25lclByb29mAAAAAAEAAAPpAAAAAgAAB9AAAAAPR292ZXJuYW5jZUVycm9yAA==",
        "AAAABQAAACNFbWl0dGVkIHdoZW4gYSBuZXcgc2lnbmVyIGlzIGFkZGVkLgAAAAAAAAAAC1NpZ25lckFkZGVkAAAAAAEAAAAMc2lnbmVyX2FkZGVkAAAAAQAAAAAAAAAGc2lnbmVyAAAAAAPuAAAAIAAAAAEAAAAC",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYSBzaWduZXIgaXMgcmVtb3ZlZC4AAAAAAAAAAAAADVNpZ25lclJlbW92ZWQAAAAAAAABAAAADnNpZ25lcl9yZW1vdmVkAAAAAAABAAAAAAAAAAZzaWduZXIAAAAAA+4AAAAgAAAAAQAAAAI=",
        "AAAABQAAACZFbWl0dGVkIHdoZW4gdGhlIHRocmVzaG9sZCBpcyB1cGRhdGVkLgAAAAAAAAAAABBUaHJlc2hvbGRVcGRhdGVkAAAAAQAAABF0aHJlc2hvbGRfdXBkYXRlZAAAAAAAAAIAAAAAAAAADW9sZF90aHJlc2hvbGQAAAAAAAAEAAAAAAAAAAAAAAANbmV3X3RocmVzaG9sZAAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAG1FbWl0dGVkIHdoZW4gcmVtb3ZpbmcgYSBzaWduZXIgZm9yY2VkIHRoZSB0aHJlc2hvbGQgdG8gYmUgbG93ZXJlZAphdXRvbWF0aWNhbGx5ICh0byBrZWVwIHRoZSBhY2NvdW50IHVzYWJsZSkuAAAAAAAAAAAAABVUaHJlc2hvbGRBdXRvQWRqdXN0ZWQAAAAAAAABAAAAF3RocmVzaG9sZF9hdXRvX2FkanVzdGVkAAAAAAIAAAAAAAAADW9sZF90aHJlc2hvbGQAAAAAAAAEAAAAAAAAAAAAAAANbmV3X3RocmVzaG9sZAAAAAAAAAQAAAAAAAAAAg==",
        "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAgAAAAEAAAB4RXhlY3V0YWJsZSBzcGVjaWZpZWQgYnkgdGhlIGNvbnRyYWN0IGluc3RhbmNlIGFzIGEgc3BlY2lmaWMgV2FzbSBjb250cmFjdCBjb2RlIGVudHJ5IGlkZW50aWZpZWQgYnkgaXRzIFdhc20gc2hhMjU2IGhhc2guAAAABFdhc20AAAABAAAD7gAAACAAAAABAAAAX0V4ZWN1dGFibGUgcmVmZXJlbmNlIHZpYSBhIHBlcnNpc3RlbnQgc3RvcmFnZSBlbnRyeSBvd25lZCBieSB0aGlzIGNvbnRyYWN0IG9yIGFub3RoZXIgY29udHJhY3QuAAAAAAtFeHRlcm5hbFJlZgAAAAABAAAH0AAAABVDb250cmFjdEV4ZWN1dGFibGVSZWYAAAA=",
        "AAAAAQAAAMBFeGVjdXRhYmxlIHJlZmVyZW5jZWQgdmlhIGEgcGVyc2lzdGVudCBzdG9yYWdlIGVudHJ5IG93bmVkIGJ5IGEgY29udHJhY3QsCmVpdGhlciB0aGlzIGNvbnRyYWN0IG9yIGFub3RoZXIgY29udHJhY3QuCgpUaGUgcGVyc2lzdGVudCBzdG9yYWdlIGVudHJ5IG93bmVkIGJ5IHRoZSBgb3duZXJgIGhhcyB0aGUgYHRhZ2AgYXMgaXRzIGtleS4AAAAAAAAAFUNvbnRyYWN0RXhlY3V0YWJsZVJlZgAAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAADdGFnAAAAABA=",
        "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA",
        "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR",
        "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=",
        "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    is_signer: this.txFromJSON<boolean>,
        add_signer: this.txFromJSON<null>,
        get_signers: this.txFromJSON<Array<Buffer>>,
        get_threshold: this.txFromJSON<u32>,
        remove_signer: this.txFromJSON<null>,
        update_threshold: this.txFromJSON<null>,
        verify_signatures: this.txFromJSON<Result<void>>
  }
}