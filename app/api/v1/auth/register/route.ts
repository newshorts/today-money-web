import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { registerSchema } from "@/contracts/schemas";
import { createRefreshSession, hashPassword, signAccessToken } from "@/lib/auth";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, registerSchema);
    const email = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "EMAIL_IN_USE", "Email is already registered");
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(body.password);
    } catch {
      throw new ApiError(500, "PASSWORD_HASH_FAILED", "Password hashing failed");
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        timezone: DEFAULT_TIMEZONE,
        budgetProfile: {
          create: {
            currency: "USD",
            incomeMonthlyCents: 0n,
            fixedMonthlyCents: 0n,
            sourceIncome: "USER_OVERRIDDEN",
            sourceFixed: "USER_OVERRIDDEN",
          },
        },
      },
    });

    const accessToken = await signAccessToken(user.id, user.email);
    const refreshToken = await createRefreshSession(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, timezone: user.timezone },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta?.target.includes("email")
    ) {
      return toErrorResponse(new ApiError(409, "EMAIL_IN_USE", "Email is already registered"));
    }

    return toErrorResponse(error);
  }
}
