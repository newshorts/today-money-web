import { ApiError } from "@/lib/errors";
import { verifyAccessToken } from "@/lib/auth";
import { z } from "zod";

export async function parseJson<T>(req: Request, schema: z.Schema<T>): Promise<T> {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(400, "INVALID_REQUEST", "Invalid request payload", {
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

export async function requireAuth(req: Request): Promise<{ userId: string; email: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing Bearer token");
  }

  const token = authHeader.slice("Bearer ".length);
  return verifyAccessToken(token);
}
