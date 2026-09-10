import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./usdt.css";
import "./splash.css";
import "./mission-games.css";
import "./briefing-readability.css";
import "./leaderboard.css";
import "./polish.css";

export const metadata: Metadata = {
  title: "Topaz: Yield Vacuum",
  description: "Learn the Topaz DEX liquidity flywheel, LP risk, and multichain expansion through eleven free arcade missions. Presented independently by The Crypto Arborist.",
  applicationName: "Yield Vacuum",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Topaz: Yield Vacuum",
    description: "Eleven free missions covering swaps, liquidity, veTOPAZ, LP risk, epochs, and Robinhood Chain expansion.",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#120502",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
