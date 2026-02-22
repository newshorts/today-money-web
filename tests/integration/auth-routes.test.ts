import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userCreate = vi.fn();

const prismaMock = {
  user: {
    findUnique: userFindUnique,
    create: userCreate,
  },
};

const hashPasswordMock = vi.fn();
const verifyPasswordMock = vi.fn();
const signAccessTokenMock = vi.fn();
const createRefreshSessionMock = vi.fn();
const rotateRefreshSessionMock = vi.fn();
const revokeRefreshSessionMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
  signAccessToken: signAccessTokenMock,
  createRefreshSession: createRefreshSessionMock,
  rotateRefreshSession: rotateRefreshSessionMock,
  revokeRefreshSession: revokeRefreshSessionMock,
}));

const registerRoute = await import("../../app/api/v1/auth/register/route");
const loginRoute = await import("../../app/api/v1/auth/login/route");
const refreshRoute = await import("../../app/api/v1/auth/refresh/route");
const logoutRoute = await import("../../app/api/v1/auth/logout/route");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auth routes", () => {
  it("register returns user and tokens", async () => {
    userFindUnique.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue("hash");
    userCreate.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      timezone: "America/Los_Angeles",
    });
    signAccessTokenMock.mockResolvedValue("access");
    createRefreshSessionMock.mockResolvedValue("refresh");

    const req = new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
      headers: { "content-type": "application/json" },
    });

    const response = await registerRoute.POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      user: {
        id: "u1",
        email: "user@example.com",
        timezone: "America/Los_Angeles",
      },
      accessToken: "access",
      refreshToken: "refresh",
    });
  });

  it("login validates credentials and issues tokens", async () => {
    userFindUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      passwordHash: "hash",
      timezone: "America/Los_Angeles",
    });
    verifyPasswordMock.mockResolvedValue(true);
    signAccessTokenMock.mockResolvedValue("access");
    createRefreshSessionMock.mockResolvedValue("refresh");

    const req = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
      headers: { "content-type": "application/json" },
    });

    const response = await loginRoute.POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.accessToken).toBe("access");
    expect(json.refreshToken).toBe("refresh");
  });

  it("refresh rotates token", async () => {
    rotateRefreshSessionMock.mockResolvedValue({ userId: "u1", refreshToken: "new-refresh" });
    userFindUnique.mockResolvedValue({ id: "u1", email: "user@example.com" });
    signAccessTokenMock.mockResolvedValue("new-access");

    const req = new Request("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "old-refresh-token-1234567890" }),
      headers: { "content-type": "application/json" },
    });

    const response = await refreshRoute.POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ accessToken: "new-access", refreshToken: "new-refresh" });
  });

  it("logout revokes token and returns 204", async () => {
    const req = new Request("http://localhost/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "old-refresh-token-1234567890" }),
      headers: { "content-type": "application/json" },
    });

    const response = await logoutRoute.POST(req);

    expect(response.status).toBe(204);
    expect(revokeRefreshSessionMock).toHaveBeenCalledWith("old-refresh-token-1234567890");
  });
});
