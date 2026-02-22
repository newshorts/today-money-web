import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "OK", asOf: new Date().toISOString() });
}
