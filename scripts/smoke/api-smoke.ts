/* eslint-disable no-console */

import {
  ApiErrorBody,
  assert,
  authHeaders,
  getApiBaseUrl,
  getSmokeCredentials,
  loginUser,
  pass,
  registerUser,
  requestJson,
  step,
} from "./shared";

function stringifyBody(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function main() {
  const baseUrl = getApiBaseUrl();
  const credentials = getSmokeCredentials("shared");

  console.log(`API base URL: ${baseUrl}`);
  console.log(`Smoke user: ${credentials.email}`);

  step("Layer 1: Health + Auth happy-path");
  const health = await requestJson<{ status: string }>(baseUrl, "/api/v1/health");
  assert(health.status === 200, `health expected 200, got ${health.status}`);
  assert(health.body?.status === "OK", "health expected status=OK");
  pass("GET /api/v1/health");

  const register = await registerUser(baseUrl, credentials);
  assert(
    register.status === 200 || register.status === 409,
    `register expected 200/409, got ${register.status}, body=${stringifyBody(register.body)}`,
  );

  if (register.status === 200) {
    const body = register.body as {
      user?: { email?: string; timezone?: string };
      accessToken?: string;
      refreshToken?: string;
    };
    assert(body.user?.email === credentials.email, "register returned unexpected email");
    assert(body.user?.timezone === "America/Los_Angeles", "register default timezone mismatch");
    assert(Boolean(body.accessToken), "register missing accessToken");
    assert(Boolean(body.refreshToken), "register missing refreshToken");
    pass("POST /api/v1/auth/register (new user)");
  } else {
    const errorBody = register.body as ApiErrorBody;
    assert(errorBody?.error?.code === "EMAIL_IN_USE", "register 409 should return EMAIL_IN_USE");
    pass("POST /api/v1/auth/register (existing user 409)");
  }

  const login = await loginUser(baseUrl, credentials);
  assert(login.status === 200, `login expected 200, got ${login.status}, body=${stringifyBody(login.body)}`);

  const loginBody = login.body as {
    user?: { email?: string; timezone?: string };
    accessToken?: string;
    refreshToken?: string;
  };

  assert(loginBody.user?.email === credentials.email, "login returned unexpected email");
  assert(Boolean(loginBody.accessToken), "login missing accessToken");
  assert(Boolean(loginBody.refreshToken), "login missing refreshToken");
  pass("POST /api/v1/auth/login");

  const accessToken = loginBody.accessToken!;
  const firstRefreshToken = loginBody.refreshToken!;

  step("Layer 2: Auth lifecycle + security");
  const duplicateRegister = await registerUser(baseUrl, credentials);
  assert(
    duplicateRegister.status === 409,
    `duplicate register expected 409, got ${duplicateRegister.status}, body=${stringifyBody(duplicateRegister.body)}`,
  );
  assert(
    (duplicateRegister.body as ApiErrorBody)?.error?.code === "EMAIL_IN_USE",
    "duplicate register should return EMAIL_IN_USE",
  );
  pass("POST /api/v1/auth/register duplicate rejected");

  const invalidLogin = await loginUser(baseUrl, {
    ...credentials,
    password: `${credentials.password}--wrong`,
  });
  assert(
    invalidLogin.status === 401,
    `invalid login expected 401, got ${invalidLogin.status}, body=${stringifyBody(invalidLogin.body)}`,
  );
  assert(
    (invalidLogin.body as ApiErrorBody)?.error?.code === "INVALID_CREDENTIALS",
    "invalid login should return INVALID_CREDENTIALS",
  );
  pass("POST /api/v1/auth/login invalid credentials rejected");

  const missingBearer = await requestJson<ApiErrorBody>(baseUrl, "/api/v1/me", {
    method: "GET",
  });
  assert(
    missingBearer.status === 401,
    `GET /me without bearer expected 401, got ${missingBearer.status}, body=${stringifyBody(missingBearer.body)}`,
  );
  assert(
    missingBearer.body?.error?.code === "UNAUTHORIZED",
    "missing bearer should return UNAUTHORIZED",
  );
  pass("GET /api/v1/me missing bearer rejected");

  const invalidBearer = await requestJson<ApiErrorBody>(baseUrl, "/api/v1/me", {
    method: "GET",
    headers: { Authorization: "Bearer invalid-token" },
  });
  assert(
    invalidBearer.status === 401,
    `GET /me invalid bearer expected 401, got ${invalidBearer.status}, body=${stringifyBody(invalidBearer.body)}`,
  );
  assert(invalidBearer.body?.error?.code === "UNAUTHORIZED", "invalid bearer should return UNAUTHORIZED");
  pass("GET /api/v1/me invalid bearer rejected");

  const me = await requestJson<{ id: string; email: string; timezone: string }>(baseUrl, "/api/v1/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(me.status === 200, `GET /me expected 200, got ${me.status}, body=${stringifyBody(me.body)}`);
  assert(me.body?.email === credentials.email, "GET /me email mismatch");
  pass("GET /api/v1/me");

  const timezonePatch = await requestJson<{ id: string; email: string; timezone: string }>(
    baseUrl,
    "/api/v1/me",
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
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
      body: JSON.stringify({ refreshToken: firstRefreshToken }),
    },
  );
  assert(refresh.status === 200, `POST /auth/refresh expected 200, got ${refresh.status}`);
  assert(Boolean(refresh.body?.accessToken), "refresh missing accessToken");
  assert(Boolean(refresh.body?.refreshToken), "refresh missing refreshToken");
  pass("POST /api/v1/auth/refresh");

  const refreshedAccessToken = refresh.body!.accessToken;
  const refreshedToken = refresh.body!.refreshToken;

  const oldRefreshReuse = await requestJson<ApiErrorBody>(baseUrl, "/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: firstRefreshToken }),
  });
  assert(
    oldRefreshReuse.status === 401,
    `Old refresh reuse expected 401, got ${oldRefreshReuse.status}, body=${stringifyBody(oldRefreshReuse.body)}`,
  );
  assert(oldRefreshReuse.body?.error?.code === "UNAUTHORIZED", "old refresh should return UNAUTHORIZED");
  pass("Old refresh token reuse rejected");

  step("Layer 3: Budget + transactions integrity");
  const budgetGet = await requestJson<{
    currency: string;
    incomeMonthlyCents: number;
    fixedMonthlyCents: number;
    sourceIncome: string;
    sourceFixed: string;
  }>(baseUrl, "/api/v1/budget/profile", {
    method: "GET",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(
    budgetGet.status === 200,
    `GET /budget/profile expected 200, got ${budgetGet.status}, body=${stringifyBody(budgetGet.body)}`,
  );
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
    headers: authHeaders(refreshedAccessToken),
    body: JSON.stringify({
      incomeMonthlyCents: 820000,
      fixedMonthlyCents: 360000,
      sourceIncome: "USER_OVERRIDDEN",
      sourceFixed: "USER_OVERRIDDEN",
    }),
  });
  assert(
    budgetPut.status === 200,
    `PUT /budget/profile expected 200, got ${budgetPut.status}, body=${stringifyBody(budgetPut.body)}`,
  );
  assert(budgetPut.body?.incomeMonthlyCents === 820000, "budget/profile income mismatch after PUT");
  pass("PUT /api/v1/budget/profile");

  const suggestions = await requestJson<{
    available: boolean;
    currency: string;
    suggestedIncomeMonthlyCents: number;
    suggestedFixedMonthlyCents: number;
  }>(baseUrl, "/api/v1/budget/suggestions", {
    method: "GET",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(
    suggestions.status === 200,
    `GET /budget/suggestions expected 200, got ${suggestions.status}, body=${stringifyBody(suggestions.body)}`,
  );
  assert(suggestions.body?.currency === "USD", "budget/suggestions currency must be USD");
  pass("GET /api/v1/budget/suggestions");

  const budgetSummary = await requestJson<{
    date: string;
    timezone: string;
    remainingTodayCents: number;
    tomorrowPreviewCents: number;
  }>(baseUrl, "/api/v1/budget/summary", {
    method: "GET",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(
    budgetSummary.status === 200,
    `GET /budget/summary expected 200, got ${budgetSummary.status}, body=${stringifyBody(budgetSummary.body)}`,
  );
  assert(Boolean(budgetSummary.body?.date), "budget/summary missing date");
  pass("GET /api/v1/budget/summary");

  const now = new Date();
  const effectiveDate = now.toISOString().slice(0, 10);

  const manualCreate = await requestJson<{ id: string }>(baseUrl, "/api/v1/transactions/manual", {
    method: "POST",
    headers: authHeaders(refreshedAccessToken),
    body: JSON.stringify({
      effectiveDate,
      name: "Smoke transaction",
      amountCents: 1234,
      currency: "USD",
    }),
  });
  assert(
    manualCreate.status === 200,
    `POST /transactions/manual expected 200, got ${manualCreate.status}, body=${stringifyBody(manualCreate.body)}`,
  );
  assert(Boolean(manualCreate.body?.id), "manual transaction response missing id");
  pass("POST /api/v1/transactions/manual");

  const createdId = manualCreate.body!.id;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const monthVisible = await requestJson<{
    transactions: {
      id: string;
      source: string;
      authorizedDate: string | null;
      isHidden: boolean;
    }[];
  }>(baseUrl, `/api/v1/transactions/month?year=${year}&month=${month}&includeHidden=false`, {
    method: "GET",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(
    monthVisible.status === 200,
    `GET /transactions/month expected 200, got ${monthVisible.status}, body=${stringifyBody(monthVisible.body)}`,
  );

  const visibleTx = monthVisible.body?.transactions?.find((tx) => tx.id === createdId);
  assert(Boolean(visibleTx), "manual transaction should appear when includeHidden=false");
  assert(visibleTx?.authorizedDate === null, "manual transaction authorizedDate should be null");
  pass("GET /api/v1/transactions/month includeHidden=false");

  const patchTx = await requestJson<{ status: string }>(baseUrl, `/api/v1/transactions/${createdId}`, {
    method: "PATCH",
    headers: authHeaders(refreshedAccessToken),
    body: JSON.stringify({
      isHidden: true,
      budgetImpact: "USER_EXCLUDED",
      userOverrideImpact: true,
    }),
  });
  assert(
    patchTx.status === 200,
    `PATCH /transactions/{id} expected 200, got ${patchTx.status}, body=${stringifyBody(patchTx.body)}`,
  );
  assert(patchTx.body?.status === "OK", "PATCH /transactions/{id} should return status OK");
  pass("PATCH /api/v1/transactions/{id}");

  const monthHiddenFiltered = await requestJson<{
    transactions: { id: string; isHidden: boolean }[];
  }>(baseUrl, `/api/v1/transactions/month?year=${year}&month=${month}&includeHidden=false`, {
    method: "GET",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(
    !monthHiddenFiltered.body?.transactions?.some((tx) => tx.id === createdId),
    "hidden transaction should not appear when includeHidden=false",
  );
  pass("Hidden transaction excluded from includeHidden=false");

  const monthHiddenIncluded = await requestJson<{
    transactions: { id: string; isHidden: boolean }[];
  }>(baseUrl, `/api/v1/transactions/month?year=${year}&month=${month}&includeHidden=true`, {
    method: "GET",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  const hiddenTx = monthHiddenIncluded.body?.transactions?.find((tx) => tx.id === createdId);
  assert(Boolean(hiddenTx), "hidden transaction should appear when includeHidden=true");
  assert(hiddenTx?.isHidden === true, "hidden transaction should have isHidden=true");
  pass("Hidden transaction included for includeHidden=true");

  const deleteTx = await requestJson(baseUrl, `/api/v1/transactions/${createdId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(deleteTx.status === 204, `DELETE /transactions/{id} expected 204, got ${deleteTx.status}`);
  pass("DELETE /api/v1/transactions/{id}");

  const logout = await requestJson(baseUrl, "/api/v1/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshedToken }),
  });
  assert(logout.status === 204, `POST /auth/logout expected 204, got ${logout.status}`);
  pass("POST /api/v1/auth/logout");

  const postLogoutRefresh = await requestJson<ApiErrorBody>(baseUrl, "/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshedToken }),
  });
  assert(
    postLogoutRefresh.status === 401,
    `Post-logout refresh expected 401, got ${postLogoutRefresh.status}, body=${stringifyBody(postLogoutRefresh.body)}`,
  );
  assert(postLogoutRefresh.body?.error?.code === "UNAUTHORIZED", "post-logout refresh should be unauthorized");
  pass("Refresh token revoked by logout");

  console.log("\nAPI deep smoke tests completed successfully.");
}

main().catch((error) => {
  console.error("API deep smoke tests failed:", error);
  process.exit(1);
});
