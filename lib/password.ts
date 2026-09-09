import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const KEY_LENGTH = 64;

export function legacyPasswordHash(value: string) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

export function hashPassword(value: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(value, salt, KEY_LENGTH);

  return [
    SCRYPT_PREFIX,
    salt.toString("hex"),
    derived.toString("hex")
  ].join("$");
}

export function verifyPassword(
  value: string,
  storedHash: string
) {
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const expected = Buffer.from(
      storedHash.toLowerCase(),
      "hex"
    );

    const actual = Buffer.from(
      legacyPasswordHash(value),
      "hex"
    );

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  }

  const parts = storedHash.split("$");

  if(
    parts.length !== 3 ||
    parts[0] !== SCRYPT_PREFIX
  ){
    return false;
  }

  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(
      value,
      salt,
      expected.length
    );

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export function needsPasswordUpgrade(
  storedHash: string
) {
  return /^[a-f0-9]{64}$/i.test(storedHash);
}