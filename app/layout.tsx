import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "today.money",
  description: "A daily budget app for iOS users.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
