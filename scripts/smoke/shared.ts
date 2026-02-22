/* eslint-disable no-console */

import { spawnSync } from "child_process";

import { PrismaClient } from "@prisma/client";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  SandboxItemFireWebhookRequestWebhookCodeEnum,
  WebhookType,
} from "plaid";

import { decryptSecret } from "../../src/lib/crypto";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    timezone: string;
  };
  accessToken: string;
  refreshToken: string;
};

export type SmokeCredentials = {
  email: string;
  password: string;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

type ApiResponse<T = unknown> = {
  status: number;
  body: T | undefined;
};

const WEBHOOK_CODES = [
  "SYNC_UPDATES_AVAILABLE",
  "RECURRING_TRANSACTIONS_UPDATE",
] as const;

const WEBHOOK_CODE_MAP: Record<
  (typeof WEBHOOK_CODES)[number],
  SandboxItemFireWebhookRequestWebhookCodeEnum
> = {
  SYNC_UPDATES_AVAILABLE: SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
  RECURRING_TRANSACTIONS_UPDATE: SandboxItemFireWebhookRequestWebhookCodeEnum.RecurringTransactionsUpdate,
};

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getApiBaseUrl(): string {
  return (process.env.API_BASE_URL || "https://today.money").trim();
}

export function getApiBaseUrls(): string[] {
  const list = (process.env.API_BASE_URLS || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (list.length > 0) {
    return list;
  }

  return [getApiBaseUrl()];
}

export function getWebhookCodes(): readonly (typeof WEBHOOK_CODES)[number][] {
  return WEBHOOK_CODES;
}

export function step(title: string): void {
  console.log(`\n== ${title} ==`);
}

export function pass(message: string): void {
  console.log(`PASS: ${message}`);
}

export function info(message: string): void {
  console.log(`INFO: ${message}`);
}

export function fail(message: string): never {
  throw new Error(message);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

export function getSmokeCredentials(prefix: string): SmokeCredentials {
  const defaultEmail = `smoke.${prefix}@today.money`;

  return {
    email: process.env.SMOKE_EMAIL || defaultEmail,
    password: process.env.SMOKE_PASSWORD || "SmokePassword-2026!",
  };
}

export async function requestJson<T = unknown>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = new URL(path, baseUrl).toString();
  const response = await fetch(url, init);

  const contentType = response.headers.get("content-type") || "";
  const hasJson = contentType.includes("application/json");

  let body: T | undefined;
  if (hasJson) {
    body = (await response.json()) as T;
  } else {
    const text = await response.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text) as T;
    }
  }

  return {
    status: response.status,
    body,
  };
}

export function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function registerUser(
  baseUrl: string,
  credentials: SmokeCredentials,
): Promise<ApiResponse<AuthSession | ApiErrorBody>> {
  return requestJson<AuthSession | ApiErrorBody>(baseUrl, "/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
}

export async function loginUser(
  baseUrl: string,
  credentials: SmokeCredentials,
): Promise<ApiResponse<AuthSession | ApiErrorBody>> {
  return requestJson<AuthSession | ApiErrorBody>(baseUrl, "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
}

export async function createOrLoginSession(baseUrl: string, prefix: string): Promise<AuthSession> {
  const credentials = getSmokeCredentials(prefix);

  const registerResponse = await registerUser(baseUrl, credentials);
  if (registerResponse.status === 200) {
    pass(`Registered smoke user ${credentials.email}`);
  } else if (registerResponse.status === 409) {
    pass(`Smoke user already exists ${credentials.email}`);
  } else {
    fail(`Register failed unexpectedly (status ${registerResponse.status})`);
  }

  const loginResponse = await loginUser(baseUrl, credentials);
  assert(loginResponse.status === 200 && loginResponse.body, `Login failed (status ${loginResponse.status})`);

  pass(`Logged in smoke user ${credentials.email}`);
  return loginResponse.body as AuthSession;
}

export function createPlaidClient(): PlaidApi {
  const envName = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;
  const basePath = PlaidEnvironments[envName];

  if (!basePath) {
    throw new Error(`Unsupported PLAID_ENV value: ${envName}`);
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": mustGetEnv("PLAID_CLIENT_ID"),
        "PLAID-SECRET": mustGetEnv("PLAID_SECRET"),
      },
    },
  });

  return new PlaidApi(configuration);
}

export async function createSandboxPublicToken(plaidClient: PlaidApi): Promise<string> {
  const institutionId = process.env.PLAID_SANDBOX_INSTITUTION_ID || "ins_109508";

  const response = await plaidClient.sandboxPublicTokenCreate({
    institution_id: institutionId,
    initial_products: [Products.Transactions],
    options: {
      webhook: process.env.PLAID_WEBHOOK_URL,
      transactions: {
        days_requested: 365,
      },
    },
  });

  return response.data.public_token;
}

export async function exchangePublicTokenWithBackend(
  baseUrl: string,
  accessToken: string,
  publicToken: string,
): Promise<void> {
  const response = await requestJson<{ status: string }>(baseUrl, "/api/v1/plaid/exchange-public-token", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      publicToken,
      metadata: {
        institutionId: process.env.PLAID_SANDBOX_INSTITUTION_ID || "ins_109508",
        institutionName: "Plaid Sandbox",
      },
    }),
  });

  assert(response.status === 200, `Expected 200 from exchange-public-token, got ${response.status}`);
  assert(response.body?.status === "OK", "exchange-public-token should return status OK");
}

export async function listPlaidItems(
  baseUrl: string,
  accessToken: string,
): Promise<
  {
    id: string;
    institutionName: string;
    status: "ACTIVE" | "DISCONNECTED";
    createdAt: string;
  }[]
> {
  const response = await requestJson<{
    items: {
      id: string;
      institutionName: string;
      status: "ACTIVE" | "DISCONNECTED";
      createdAt: string;
    }[];
  }>(baseUrl, "/api/v1/plaid/items", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert(response.status === 200, `Expected 200 from plaid/items, got ${response.status}`);
  return response.body?.items || [];
}

export async function runSyncWithRetry(
  baseUrl: string,
  accessToken: string,
  attempts = 5,
): Promise<{ status: string; syncedItems: number; added: number; modified: number; removed: number }> {
  let lastError = "unknown";

  for (let i = 1; i <= attempts; i += 1) {
    const response = await requestJson<{
      status: string;
      syncedItems: number;
      added: number;
      modified: number;
      removed: number;
    }>(baseUrl, "/api/v1/plaid/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 200 && response.body?.status === "OK") {
      return response.body;
    }

    lastError = `status=${response.status}`;
    await sleep(i * 1500);
  }

  fail(`plaid/sync failed after ${attempts} attempts (${lastError})`);
}

export async function fetchPlaidTokenForItem(
  userId: string,
  internalItemId: string,
): Promise<{ plaidItemId: string; accessToken: string }> {
  const prisma = new PrismaClient();

  try {
    const row = await prisma.plaidItem.findFirst({
      where: {
        id: internalItemId,
        userId,
      },
    });

    assert(Boolean(row), `No plaid item found in DB for id=${internalItemId}`);

    return {
      plaidItemId: row!.plaidItemId,
      accessToken: decryptSecret(row!.accessTokenEnc),
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function fireSandboxWebhook(
  plaidClient: PlaidApi,
  accessToken: string,
  code: (typeof WEBHOOK_CODES)[number],
): Promise<void> {
  await plaidClient.sandboxItemFireWebhook({
    access_token: accessToken,
    webhook_code: WEBHOOK_CODE_MAP[code],
    webhook_type: WebhookType.Transactions,
  });
}

export function runScriptForBaseUrl(scriptName: string, baseUrl: string): void {
  const child = spawnSync("npm", ["run", scriptName], {
    stdio: "inherit",
    env: {
      ...process.env,
      API_BASE_URL: baseUrl,
    },
  });

  if (child.status !== 0) {
    throw new Error(`Script ${scriptName} failed for ${baseUrl} (exit ${child.status ?? -1})`);
  }
}
