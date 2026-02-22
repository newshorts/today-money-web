import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/http";
import { toErrorResponse } from "@/lib/errors";
import { getPlaidClient, PLAID_COUNTRY_CODES, PLAID_PRODUCTS } from "@/lib/plaid";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const plaid = getPlaidClient();

    const response = await plaid.linkTokenCreate({
      user: {
        client_user_id: auth.userId,
      },
      client_name: "today.money",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
      redirect_uri: process.env.PLAID_REDIRECT_URI,
      webhook: process.env.PLAID_WEBHOOK_URL,
      transactions: {
        days_requested: 365,
      },
    });

    return NextResponse.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
