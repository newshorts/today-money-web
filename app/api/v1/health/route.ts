import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "OK",
      asOf: new Date().toISOString(),
      checks: {
        database: "OK",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
