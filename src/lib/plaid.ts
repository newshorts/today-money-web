import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";

import { ApiError } from "@/lib/errors";

let plaidClient: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (plaidClient) {
    return plaidClient;
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;

  if (!clientId || !secret || !PlaidEnvironments[env]) {
    throw new ApiError(500, "SERVER_CONFIG_ERROR", "Plaid credentials are missing or invalid");
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  plaidClient = new PlaidApi(config);
  return plaidClient;
}

export const PLAID_PRODUCTS: Products[] = [Products.Transactions];
export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];
