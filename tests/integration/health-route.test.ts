import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const queryRawMock = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

const healthRoute = await import("../../app/api/v1/health/route");

beforeEach(() => {
  vi.resetAllMocks();
  consoleErrorSpy.mockImplementation(() => {});
  consoleErrorSpy.mockClear();
});

describe("health route", () => {
  it("returns 200 and db check when database is reachable", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "OK",
      checks: { database: "OK" },
    });
    expect(typeof body.asOf).toBe("string");
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns 503 when prisma initialization fails", async () => {
    const initError = new Prisma.PrismaClientInitializationError(
      "Can't reach database",
      "6.4.1",
      "INIT_ERROR",
    );
    queryRawMock.mockRejectedValue(initError);

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: "DB_UNAVAILABLE",
      },
    });
  });
});
