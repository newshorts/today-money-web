import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/http";
import { syncAllItemsForUser } from "@/lib/sync";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const result = await syncAllItemsForUser(auth.userId);

    return NextResponse.json({
      status: "OK",
      syncedItems: result.syncedItems,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
