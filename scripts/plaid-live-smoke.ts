/* eslint-disable no-console */

type Json = Record<string, unknown>;

async function main() {
  if (process.env.RUN_LIVE_PLAID_TESTS !== "true") {
    console.log("Skipping live Plaid smoke tests (set RUN_LIVE_PLAID_TESTS=true to run).");
    process.exit(0);
  }

  const apiBaseUrl = process.env.API_BASE_URL;
  const accessToken = process.env.TEST_ACCESS_TOKEN;

  if (!apiBaseUrl || !accessToken) {
    throw new Error("API_BASE_URL and TEST_ACCESS_TOKEN are required for live Plaid smoke tests");
  }

  const health = await requestJson(`${apiBaseUrl}/api/v1/health`);
  console.log("Health OK:", health);

  const linkToken = await requestJson(`${apiBaseUrl}/api/v1/plaid/link-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  console.log("Link token created:", {
    expiration: linkToken.expiration,
    hasToken: Boolean(linkToken.linkToken),
  });

  const publicToken = process.env.PLAID_TEST_PUBLIC_TOKEN;
  if (publicToken) {
    const exchange = await requestJson(`${apiBaseUrl}/api/v1/plaid/exchange-public-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        publicToken,
        metadata: {
          institutionName: "Sandbox",
          institutionId: "ins_sandbox",
        },
      }),
    });
    console.log("Public token exchange response:", exchange);

    const sync = await requestJson(`${apiBaseUrl}/api/v1/plaid/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    console.log("Sync response:", sync);
  } else {
    console.log("PLAID_TEST_PUBLIC_TOKEN not set; skipping exchange and sync steps.");
  }

  console.log("Live Plaid smoke checks completed.");
}

async function requestJson(url: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(url, init);
  const json = (await response.json()) as Json;

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
