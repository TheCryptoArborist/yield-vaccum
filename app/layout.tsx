import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./usdt.css";
import "./splash.css";
import "./mission-games.css";
import "./briefing-readability.css";
import "./leaderboard.css";
import "./polish.css";

export const metadata: Metadata = {
  title: "Yield Vaccum | Topaz & MSS2 Arcade",
  description: "Choose your game: learn Topaz DeFi, xTOPAZ and managed liquidity through sixteen free educational missions, or play MSS2 Mint Flyer with a $1 MSS2 entry on Robinhood Chain or Arc. An independent community arcade by The Crypto Arborist.",
  applicationName: "Yield Vaccum",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Yield Vaccum | Topaz & MSS2 Arcade",
    description: "Two worlds. Choose your game. Free Topaz educational missions or $1 MSS2 Mint Flyer flights on Robinhood Chain and Arc.",
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
