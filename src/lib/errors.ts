import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseDatabaseEndpoint(): { host?: string; port?: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {};
  }

  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname || undefined,
      port: parsed.port || undefined,
    };
  } catch {
    return {};
  }
}

function compactErrorMessage(message: string): string {
  const parts = message
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  return parts.at(-1) ?? "Prisma initialization failed";
}

export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    const endpoint = parseDatabaseEndpoint();
    console.error("Prisma initialization failed", {
      prismaCode: error.errorCode ?? "INIT_ERROR",
      message: compactErrorMessage(error.message),
      dbHost: endpoint.host ?? null,
      dbPort: endpoint.port ?? null,
      pgHost: process.env.PGHOST ?? null,
      pgPort: process.env.PGPORT ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
    });

    return NextResponse.json(
      {
        error: {
          code: "DB_UNAVAILABLE",
          message: "Database connection failed",
          details: { prismaCode: error.errorCode ?? "INIT_ERROR" },
        },
      },
      { status: 503 },
    );
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return NextResponse.json(
      {
        error: {
          code: "DB_ENGINE_ERROR",
          message: "Database engine panic occurred",
        },
      },
      { status: 500 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const status = error.code === "P2002" ? 409 : 500;
    const code = error.code === "P2002" ? "CONFLICT" : "DB_REQUEST_ERROR";
    const message = error.code === "P2002" ? "Unique constraint violation" : "Database request failed";

    return NextResponse.json(
      {
        error: {
          code,
          message,
          details: { prismaCode: error.code },
        },
      },
      { status },
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      {
        error: {
          code: "DB_VALIDATION_ERROR",
          message: "Database query validation failed",
        },
      },
      { status: 500 },
    );
  }

  console.error("Unhandled API error", error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    { status: 500 },
  );
}
