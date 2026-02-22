import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "ABCDE12345.com.todaymoney.app",
          paths: ["/plaid", "/plaid/*"],
        },
      ],
    },
  });
}
