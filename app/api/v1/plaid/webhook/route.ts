import { createHash } from "crypto";

import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/errors";
import { getPlaidClient } from "@/lib/plaid";
import { refreshRecurringForPlaidItemId } from "@/lib/recurring";
import { syncItemByPlaidItemId } from "@/lib/sync";

const jwkCache = new Map<string, JsonWebKey>();

type PlaidWebhookPayload = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    if (process.env.PLAID_WEBHOOK_VERIFICATION === "true") {
      await verifyPlaidWebhookSignature(req, rawBody);
    }

    const payload = JSON.parse(rawBody) as PlaidWebhookPayload;

    if (payload.item_id && payload.webhook_code === "SYNC_UPDATES_AVAILABLE") {
      try {
        await syncItemByPlaidItemId(payload.item_id);
      } catch (error) {
        console.error("Webhook sync failed", error);
      }
    }

    if (payload.item_id && payload.webhook_code === "RECURRING_TRANSACTIONS_UPDATE") {
      try {
        await refreshRecurringForPlaidItemId(payload.item_id);
      } catch (error) {
        console.error("Webhook recurring refresh failed", error);
      }
    }

    return NextResponse.json({ status: "OK" });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function verifyPlaidWebhookSignature(req: Request, rawBody: string): Promise<void> {
  const token = req.headers.get("Plaid-Verification");
  if (!token) {
    throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing Plaid-Verification header");
  }

  const header = decodeProtectedHeader(token);
  const keyId = header.kid;

  if (!keyId) {
    throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing JWT key id");
  }

  let jwk = jwkCache.get(keyId);

  if (!jwk) {
    const plaid = getPlaidClient();
    const response = await plaid.webhookVerificationKeyGet({ key_id: keyId });
    jwk = response.data.key as unknown as JsonWebKey;
    jwkCache.set(keyId, jwk);
  }

  const key = await importJWK(jwk, "ES256");
  const verified = await jwtVerify(token, key, {
    algorithms: ["ES256"],
  });

  const claimHash = (verified.payload.request_body_sha256 as string | undefined)?.toLowerCase();
  const bodyHash = createHash("sha256").update(rawBody).digest("hex").toLowerCase();

  if (!claimHash || claimHash !== bodyHash) {
    throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Invalid webhook body hash");
  }
}
