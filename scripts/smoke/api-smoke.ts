/* eslint-disable no-console */

import {
  assert,
  authHeaders,
  createOrLoginSession,
  getApiBaseUrl,
  pass,
  requestJson,
  step,
} from "./shared";

async function main() {
  const baseUrl = getApiBaseUrl();
  console.log(`API base URL: ${baseUrl}`);

  step("Health");
  const health = await requestJson<{ status: string }>(baseUrl, "/api/v1/health");
  assert(health.status === 200, `health expected 200, got ${health.status}`);
  assert(health.body?.status === "OK", "health expected status=OK");
  pass("GET /api/v1/health");

  step("Auth + Profile");
  const session = await createOrLoginSession(baseUrl, "api-smoke");

  const me = await requestJson<{ id: string; email: string; timezone: string }>(baseUrl, "/api/v1/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  assert(me.status === 200, `GET /me expected 200, got ${me.status}`);
  assert(me.body?.email === session.user.email, "GET /me email mismatch");
  pass("GET /api/v1/me");

  const timezonePatch = await requestJson<{ id: string; email: string; timezone: string }>(
    baseUrl,
    "/api/v1/me",
    {
      method: "PATCH",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({ timezone: "America/Denver" }),
    },
  );
  assert(timezonePatch.status === 200, `PATCH /me expected 200, got ${timezonePatch.status}`);
  assert(timezonePatch.body?.timezone === "America/Denver", "PATCH /me timezone was not updated");
  pass("PATCH /api/v1/me");

  const refresh = await requestJson<{ accessToken: string; refreshToken: string }>(
    baseUrl,
    "/api/v1/auth/refresh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    },
  );
  assert(refresh.status === 200, `POST /auth/refresh expected 200, got ${refresh.status}`);
  assert(Boolean(refresh.body?.accessToken), "refresh missing accessToken");
  assert(Boolean(refresh.body?.refreshToken), "refresh missing refreshToken");
  pass("POST /api/v1/auth/refresh");

  const accessToken = refresh.body!.accessToken;
  const refreshToken = refresh.body!.refreshToken;

  step("Budget");
  const budgetGet = await requestJson<{
    currency: string;
    incomeMonthlyCents: number;
    fixedMonthlyCents: number;
    sourceIncome: string;
    sourceFixed: string;
  }>(baseUrl, "/api/v1/budget/profile", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(budgetGet.status === 200, `GET /budget/profile expected 200, got ${budgetGet.status}`);
  assert(budgetGet.body?.currency === "USD", "budget/profile currency must be USD");
  pass("GET /api/v1/budget/profile");

  const budgetPut = await requestJson<{
    currency: string;
    incomeMonthlyCents: number;
    fixedMonthlyCents: number;
    sourceIncome: string;
    sourceFixed: string;
  }>(baseUrl, "/api/v1/budget/profile", {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      incomeMonthlyCents: 820000,
      fixedMonthlyCents: 360000,
      sourceIncome: "USER_OVERRIDDEN",
      sourceFixed: "USER_OVERRIDDEN",
    }),
  });
  assert(budgetPut.status === 200, `PUT /budget/profile expected 200, got ${budgetPut.status}`);
  assert(budgetPut.body?.incomeMonthlyCents === 820000, "budget/profile income mismatch after PUT");
  pass("PUT /api/v1/budget/profile");

  const budgetSummary = await requestJson<{
    date: string;
    timezone: string;
    remainingTodayCents: number;
    tomorrowPreviewCents: number;
  }>(baseUrl, "/api/v1/budget/summary", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(budgetSummary.status === 200, `GET /budget/summary expected 200, got ${budgetSummary.status}`);
  assert(Boolean(budgetSummary.body?.date), "budget/summary missing date");
  pass("GET /api/v1/budget/summary");

  step("Transactions");
  const now = new Date();
  const effectiveDate = now.toISOString().slice(0, 10);

  const manualCreate = await requestJson<{ id: string }>(baseUrl, "/api/v1/transactions/manual", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      effectiveDate,
      name: "Smoke transaction",
      amountCents: 1234,
      currency: "USD",
    }),
  });
  assert(manualCreate.status === 200, `POST /transactions/manual expected 200, got ${manualCreate.status}`);
  assert(Boolean(manualCreate.body?.id), "manual transaction response missing id");
  pass("POST /api/v1/transactions/manual");

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const monthList = await requestJson<{
    transactions: { id: string; source: string }[];
  }>(baseUrl, `/api/v1/transactions/month?year=${year}&month=${month}&includeHidden=false`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(monthList.status === 200, `GET /transactions/month expected 200, got ${monthList.status}`);

  const createdId = manualCreate.body!.id;
  const found = monthList.body?.transactions?.find((tx) => tx.id === createdId);
  assert(Boolean(found), "created manual transaction was not returned by month query");
  pass("GET /api/v1/transactions/month");

  const patchTx = await requestJson<{ status: string }>(baseUrl, `/api/v1/transactions/${createdId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      isHidden: true,
      budgetImpact: "USER_EXCLUDED",
      userOverrideImpact: true,
    }),
  });
  assert(patchTx.status === 200, `PATCH /transactions/{id} expected 200, got ${patchTx.status}`);
  assert(patchTx.body?.status === "OK", "PATCH /transactions/{id} should return status OK");
  pass("PATCH /api/v1/transactions/{id}");

  const deleteTx = await requestJson(baseUrl, `/api/v1/transactions/${createdId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(deleteTx.status === 204, `DELETE /transactions/{id} expected 204, got ${deleteTx.status}`);
  pass("DELETE /api/v1/transactions/{id}");

  const logout = await requestJson(baseUrl, "/api/v1/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  assert(logout.status === 204, `POST /auth/logout expected 204, got ${logout.status}`);
  pass("POST /api/v1/auth/logout");

  console.log("\nAPI smoke tests completed successfully.");
}

main().catch((error) => {
  console.error("API smoke tests failed:", error);
  process.exit(1);
});
