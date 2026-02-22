/* eslint-disable no-console */

import {
  assert,
  authHeaders,
  createOrLoginSession,
  createPlaidClient,
  createSandboxPublicToken,
  exchangePublicTokenWithBackend,
  fetchPlaidTokenForItem,
  fireSandboxWebhook,
  getApiBaseUrl,
  getWebhookCodes,
  listPlaidItems,
  pass,
  requestJson,
  sleep,
  step,
} from "./shared";

async function main() {
  if (process.env.RUN_LIVE_PLAID_TESTS !== "true") {
    console.log("Skipping webhook smoke tests (set RUN_LIVE_PLAID_TESTS=true).");
    process.exit(0);
  }

  const baseUrl = getApiBaseUrl();
  console.log(`API base URL: ${baseUrl}`);

  step("Create auth session + plaid item for webhook tests");
  const session = await createOrLoginSession(baseUrl, "webhook-smoke");

  const plaidClient = createPlaidClient();
  const publicToken = await createSandboxPublicToken(plaidClient);
  await exchangePublicTokenWithBackend(baseUrl, session.accessToken, publicToken);

  const items = await listPlaidItems(baseUrl, session.accessToken);
  const activeItems = items.filter((item) => item.status === "ACTIVE");
  assert(activeItems.length > 0, "Expected at least one ACTIVE plaid item for webhook tests");

  const latestItem = activeItems.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  let webhookItemId = latestItem.id;
  let dbToken: { plaidItemId: string; accessToken: string } | null = null;

  try {
    dbToken = await fetchPlaidTokenForItem(session.user.id, latestItem.id);
    webhookItemId = dbToken.plaidItemId;
  } catch (error) {
    console.warn(
      "Could not resolve plaid_item_id from DB for unsigned webhook payload; falling back to internal id:",
      error,
    );
  }

  const expectsVerification = process.env.PLAID_WEBHOOK_VERIFICATION_EXPECTED === "true";

  step("Stage A: direct webhook POST behavior");
  for (const code of getWebhookCodes()) {
    const response = await requestJson<{ status: string }>(baseUrl, "/api/v1/plaid/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhook_type: "TRANSACTIONS",
        webhook_code: code,
        item_id: webhookItemId,
      }),
    });

    if (expectsVerification) {
      assert(
        response.status === 401,
        `Unsigned webhook should fail with 401 when verification is expected (got ${response.status})`,
      );
    } else {
      assert(response.status === 200, `Unsigned webhook expected 200, got ${response.status}`);
      assert(response.body?.status === "OK", "Unsigned webhook expected status=OK body");
    }

    pass(`POST /api/v1/plaid/webhook (${code}, unsigned)`);
  }

  if (process.env.RUN_SIGNED_WEBHOOK_TESTS === "true") {
    step("Stage B: fire signed webhooks from Plaid sandbox");

    let signedWebhookAccessToken = dbToken?.accessToken;
    if (!signedWebhookAccessToken) {
      console.warn(
        "DB token lookup unavailable for signed webhook tests; creating standalone sandbox item for signed webhook firing.",
      );
      const signedPublicToken = await createSandboxPublicToken(plaidClient);
      const exchange = await plaidClient.itemPublicTokenExchange({
        public_token: signedPublicToken,
      });
      signedWebhookAccessToken = exchange.data.access_token;
    }

    for (const code of getWebhookCodes()) {
      await fireSandboxWebhook(plaidClient, signedWebhookAccessToken, code);
      pass(`Plaid sandbox fire webhook (${code}) accepted`);
      await sleep(2000);
    }

    const itemsAfter = await listPlaidItems(baseUrl, session.accessToken);
    assert(itemsAfter.length > 0, "Expected plaid items to remain queryable after signed webhook fire");
    pass("GET /api/v1/plaid/items after signed webhook events");
  }

  if (process.env.SMOKE_PLAID_DISCONNECT === "true") {
    step("Disconnect linked item (optional cleanup)");
    const disconnect = await requestJson(baseUrl, `/api/v1/plaid/items/${latestItem.id}`, {
      method: "DELETE",
      headers: authHeaders(session.accessToken),
    });

    assert(disconnect.status === 204, `DELETE /plaid/items/{itemId} expected 204, got ${disconnect.status}`);
    pass("DELETE /api/v1/plaid/items/{itemId}");
  }

  console.log("\nWebhook smoke tests completed successfully.");
}

main().catch((error) => {
  console.error("Webhook smoke tests failed:", error);
  process.exit(1);
});
