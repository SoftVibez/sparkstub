import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkstub — Lightning withdraw vouchers",
  description:
    "Print a QR. Scan with any Lightning wallet. Withdraw a preset amount of sats. One-time-use enforced.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
