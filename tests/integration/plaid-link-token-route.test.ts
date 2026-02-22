import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const linkTokenCreateMock = vi.fn();
const getPlaidClientMock = vi.fn();

vi.mock("@/lib/http", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/plaid", () => ({
  getPlaidClient: getPlaidClientMock,
  PLAID_COUNTRY_CODES: ["US"],
  PLAID_PRODUCTS: ["transactions"],
}));

const route = await import("../../app/api/v1/plaid/link-token/route");

const originalRedirectUri = process.env.PLAID_REDIRECT_URI;
const originalWebhookUrl = process.env.PLAID_WEBHOOK_URL;

beforeEach(() => {
  vi.resetAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "user-1", email: "user@example.com" });
  getPlaidClientMock.mockReturnValue({
    linkTokenCreate: linkTokenCreateMock,
  });
  process.env.PLAID_REDIRECT_URI = "https://today.money/plaid";
  process.env.PLAID_WEBHOOK_URL = "https://today.money/api/v1/plaid/webhook";
});

afterEach(() => {
  process.env.PLAID_REDIRECT_URI = originalRedirectUri;
  process.env.PLAID_WEBHOOK_URL = originalWebhookUrl;
});

describe("plaid link token route", () => {
  it("creates a link token on first attempt when redirect uri is valid", async () => {
    linkTokenCreateMock.mockResolvedValue({
      data: {
        link_token: "link-token-123",
        expiration: "2026-03-01T00:00:00Z",
      },
    });

    const response = await route.POST(new Request("http://localhost/api/v1/plaid/link-token", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      linkToken: "link-token-123",
      expiration: "2026-03-01T00:00:00Z",
    });

    expect(linkTokenCreateMock).toHaveBeenCalledTimes(1);
    expect(linkTokenCreateMock.mock.calls[0][0]).toMatchObject({
      redirect_uri: "https://today.money/plaid",
      webhook: "https://today.money/api/v1/plaid/webhook",
    });
  });

  it("retries without redirect_uri when Plaid dashboard rejects redirect configuration", async () => {
    linkTokenCreateMock
      .mockRejectedValueOnce({
        response: {
          data: {
            error_code: "INVALID_FIELD",
            error_message: "OAuth redirect URI must be configured in the developer dashboard.",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          link_token: "link-token-retry",
          expiration: "2026-03-01T00:00:00Z",
        },
      });

    const response = await route.POST(new Request("http://localhost/api/v1/plaid/link-token", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.linkToken).toBe("link-token-retry");
    expect(linkTokenCreateMock).toHaveBeenCalledTimes(2);
    expect(linkTokenCreateMock.mock.calls[0][0]).toHaveProperty(
      "redirect_uri",
      "https://today.money/plaid",
    );
    expect(linkTokenCreateMock.mock.calls[1][0]).not.toHaveProperty("redirect_uri");
  });
});

