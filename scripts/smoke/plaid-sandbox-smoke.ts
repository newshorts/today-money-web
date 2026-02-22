/* eslint-disable no-console */

import {
  assert,
  authHeaders,
  createOrLoginSession,
  createPlaidClient,
  createSandboxPublicToken,
  exchangePublicTokenWithBackend,
  getApiBaseUrl,
  listPlaidItems,
  pass,
  requestJson,
  runSyncWithRetry,
  step,
} from "./shared";

async function main() {
  if (process.env.RUN_LIVE_PLAID_TESTS !== "true") {
    console.log("Skipping plaid sandbox smoke tests (set RUN_LIVE_PLAID_TESTS=true).");
    process.exit(0);
  }

  const baseUrl = getApiBaseUrl();
  console.log(`API base URL: ${baseUrl}`);

  step("Auth session for Plaid smoke");
  const session = await createOrLoginSession(baseUrl, "plaid-smoke");

  step("Backend link token endpoint");
  const linkToken = await requestJson<{ linkToken: string; expiration: string }>(
    baseUrl,
    "/api/v1/plaid/link-token",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );
  assert(linkToken.status === 200, `POST /plaid/link-token expected 200, got ${linkToken.status}`);
  assert(Boolean(linkToken.body?.linkToken), "link-token response missing linkToken");
  pass("POST /api/v1/plaid/link-token");

  step("Create sandbox public token and exchange via backend");
  const plaidClient = createPlaidClient();
  const publicToken = await createSandboxPublicToken(plaidClient);
  assert(Boolean(publicToken), "sandbox public token creation returned empty token");

  await exchangePublicTokenWithBackend(baseUrl, session.accessToken, publicToken);
  pass("POST /api/v1/plaid/exchange-public-token");

  step("Validate plaid items + sync");
  const items = await listPlaidItems(baseUrl, session.accessToken);
  const activeItems = items.filter((item) => item.status === "ACTIVE");
  assert(activeItems.length > 0, "Expected at least one ACTIVE plaid item after exchange");
  pass("GET /api/v1/plaid/items");

  const sync = await runSyncWithRetry(baseUrl, session.accessToken, 6);
  assert(sync.status === "OK", "plaid/sync should return status OK");
  pass("POST /api/v1/plaid/sync");

  step("Validate suggestions + summary after sync");
  const suggestions = await requestJson<{
    available: boolean;
    currency: string;
    suggestedIncomeMonthlyCents: number;
    suggestedFixedMonthlyCents: number;
  }>(baseUrl, "/api/v1/budget/suggestions", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  assert(suggestions.status === 200, `GET /budget/suggestions expected 200, got ${suggestions.status}`);
  assert(suggestions.body?.currency === "USD", "budget/suggestions currency must be USD");
  pass("GET /api/v1/budget/suggestions");

  const summary = await requestJson<{
    date: string;
    timezone: string;
    incomeMonthlyCents: number;
    fixedMonthlyCents: number;
    remainingTodayCents: number;
  }>(baseUrl, "/api/v1/budget/summary", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  assert(summary.status === 200, `GET /budget/summary expected 200, got ${summary.status}`);
  assert(Boolean(summary.body?.date), "budget/summary response missing date");
  pass("GET /api/v1/budget/summary");

  if (process.env.SMOKE_PLAID_DISCONNECT === "true") {
    step("Disconnect linked plaid item (optional cleanup)");
    const latest = activeItems.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

    const disconnect = await requestJson(baseUrl, `/api/v1/plaid/items/${latest.id}`, {
      method: "DELETE",
      headers: authHeaders(session.accessToken),
    });

    assert(disconnect.status === 204, `DELETE /plaid/items/{itemId} expected 204, got ${disconnect.status}`);
    pass("DELETE /api/v1/plaid/items/{itemId}");
  }

  console.log("\nPlaid sandbox smoke tests completed successfully.");
}

main().catch((error) => {
  console.error("Plaid sandbox smoke tests failed:", error);
  process.exit(1);
});
