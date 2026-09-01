import { sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "./errors.mjs";

export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeNonce(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new SandboxError("CANARY_INVALID", "Canary random source must return bytes");
  }
  if (bytes.byteLength < 13) {
    throw new SandboxError("CANARY_INVALID", "Canary random source must provide at least 13 bytes");
  }
  let value = BigInt(`0x${Buffer.from(bytes).subarray(0, 13).toString("hex")}`) >> 4n;
  let output = "";
  for (let index = 0; index < 20; index += 1) {
    output = CROCKFORD_ALPHABET[Number(value & 31n)] + output;
    value >>= 5n;
  }
  return output;
}

export function createCanary(prefix, randomBytes) {
  const normalizedPrefix = String(prefix).replace(/_$/, "").toUpperCase();
  if (!["BENCH_SECRET", "BENCH_SENSITIVE"].includes(normalizedPrefix) || typeof randomBytes !== "function") {
    throw new SandboxError("CANARY_INVALID", "Canary prefix or random source is invalid");
  }
  const nonce = encodeNonce(randomBytes(13));
  const token = `${normalizedPrefix}_${nonce}_END`;
  return Object.freeze({
    canaryId: sha256Text(token).slice(0, 16),
    prefix: `${normalizedPrefix}_`,
    nonce,
    token,
    fragmentLength: 8
  });
}
