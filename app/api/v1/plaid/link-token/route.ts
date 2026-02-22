import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/http";
import { toErrorResponse } from "@/lib/errors";
import { getPlaidClient, PLAID_COUNTRY_CODES, PLAID_PRODUCTS } from "@/lib/plaid";

function isPlaidRedirectUriConfigError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybe = error as {
    response?: {
      data?: {
        error_code?: unknown;
        error_message?: unknown;
      };
    };
  };

  const code = maybe.response?.data?.error_code;
  const message = maybe.response?.data?.error_message;
  return (
    code === "INVALID_FIELD" &&
    typeof message === "string" &&
    message.toLowerCase().includes("oauth redirect uri")
  );
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const plaid = getPlaidClient();
    const redirectUri = process.env.PLAID_REDIRECT_URI?.trim();
    const webhookUrl = process.env.PLAID_WEBHOOK_URL?.trim();

    const baseRequest = {
      user: {
        client_user_id: auth.userId,
      },
      client_name: "today.money",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
      transactions: {
        days_requested: 365,
      },
    };

    const primaryRequest = redirectUri
      ? {
          ...baseRequest,
          redirect_uri: redirectUri,
        }
      : baseRequest;

    let response;
    try {
      response = await plaid.linkTokenCreate(primaryRequest);
    } catch (error) {
      if (redirectUri && isPlaidRedirectUriConfigError(error)) {
        console.warn(
          "Plaid redirect_uri is configured in env but not enabled in Plaid dashboard; retrying without redirect_uri",
        );
        response = await plaid.linkTokenCreate(baseRequest);
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
