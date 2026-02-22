import { randomBytes, createHash } from "crypto";

import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";

import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

const refreshTokenLengthBytes = 48;

type AccessClaims = {
  sub: string;
  email: string;
};

function accessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new ApiError(500, "SERVER_CONFIG_ERROR", "JWT_ACCESS_SECRET is missing");
  }
  return new TextEncoder().encode(secret);
}

function refreshPepper(): string {
  const pepper = process.env.REFRESH_TOKEN_PEPPER;
  if (!pepper) {
    throw new ApiError(500, "SERVER_CONFIG_ERROR", "REFRESH_TOKEN_PEPPER is missing");
  }
  return pepper;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export async function signAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret());
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; email: string }> {
  try {
    const verified = await jwtVerify<AccessClaims>(token, accessSecret(), {
      algorithms: ["HS256"],
    });

    if (!verified.payload.sub || !verified.payload.email) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid access token payload");
    }

    return { userId: verified.payload.sub, email: verified.payload.email };
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired access token");
  }
}

export function generateRefreshToken(): string {
  return randomBytes(refreshTokenLengthBytes).toString("base64url");
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(`${refreshToken}${refreshPepper()}`).digest("hex");
}

export async function createRefreshSession(userId: string): Promise<string> {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshSession.create({
    data: {
      userId,
      refreshTokenHash,
      expiresAt,
    },
  });

  return refreshToken;
}

export async function rotateRefreshSession(
  refreshToken: string,
): Promise<{ userId: string; refreshToken: string }> {
  const now = new Date();
  const currentHash = hashRefreshToken(refreshToken);

  const currentSession = await prisma.refreshSession.findUnique({
    where: { refreshTokenHash: currentHash },
  });

  if (!currentSession || currentSession.revokedAt || currentSession.expiresAt <= now) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid refresh token");
  }

  const nextRefreshToken = generateRefreshToken();
  const nextRefreshHash = hashRefreshToken(nextRefreshToken);
  const nextExpiry = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshSession.update({
      where: { id: currentSession.id },
      data: { revokedAt: now },
    }),
    prisma.refreshSession.create({
      data: {
        userId: currentSession.userId,
        refreshTokenHash: nextRefreshHash,
        expiresAt: nextExpiry,
      },
    }),
  ]);

  return {
    userId: currentSession.userId,
    refreshToken: nextRefreshToken,
  };
}

export async function revokeRefreshSession(refreshToken: string): Promise<void> {
  const refreshHash = hashRefreshToken(refreshToken);
  await prisma.refreshSession.updateMany({
    where: {
      refreshTokenHash: refreshHash,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
