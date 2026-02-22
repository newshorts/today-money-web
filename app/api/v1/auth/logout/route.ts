import { NextResponse } from "next/server";

import { refreshSchema } from "@/contracts/schemas";
import { revokeRefreshSession } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { parseJson } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, refreshSchema);
    await revokeRefreshSession(body.refreshToken);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
