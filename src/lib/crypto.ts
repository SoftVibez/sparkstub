import { randomBytes } from "crypto";

// This app no longer stores any spending keys, so there is nothing to encrypt.
// We only need unguessable secret tokens (manage link + webhook URL).
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export const generateManageToken = generateToken;
export const generateWebhookSecret = generateToken;
