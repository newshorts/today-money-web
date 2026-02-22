import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { ApiError } from "@/lib/errors";

type TokenEnvelope = {
  kid: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

function getKeyMaterial(): { key: Buffer; kid: string } {
  const base64 = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  const kid = process.env.PLAID_TOKEN_ENCRYPTION_KID;

  if (!base64 || !kid) {
    throw new ApiError(500, "SERVER_CONFIG_ERROR", "Plaid encryption key configuration missing");
  }

  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new ApiError(500, "SERVER_CONFIG_ERROR", "Plaid encryption key must decode to 32 bytes");
  }

  return { key, kid };
}

export function encryptSecret(plaintext: string): string {
  const { key, kid } = getKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: TokenEnvelope = {
    kid,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  return JSON.stringify(envelope);
}

export function decryptSecret(payload: string): string {
  const { key } = getKeyMaterial();

  let envelope: TokenEnvelope;
  try {
    envelope = JSON.parse(payload) as TokenEnvelope;
  } catch {
    throw new ApiError(500, "DECRYPTION_FAILED", "Encrypted payload is not valid JSON");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    throw new ApiError(500, "DECRYPTION_FAILED", "Unable to decrypt payload");
  }
}
