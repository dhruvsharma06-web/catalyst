import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 32;

/** Hashes a passcode with scrypt and a random salt. Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(passcode.normalize("NFKC"), salt, KEY_LEN, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Verifies a passcode in constant time. Malformed hashes never verify. */
export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(passcode.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A precomputed hash used to spend equal time when a circle code does not exist. */
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  decoy ??= hashPasscode(randomBytes(12).toString("hex"));
  return decoy;
}
