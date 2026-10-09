import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import MotionProvider from "@/components/MotionProvider";
import "./globals.css";

// Self-hosted at build time by next/font, no request to Google at runtime.
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://allsport-freunde.com"),
  title: "Allsport Freunde 2026 e.V.",
  description:
    "Gemeinnütziger Sportverein in der Rhein-Main-Region. Fußball, Fitness, Schwimmen und mehr, für alle, die Bewegung und Gemeinschaft lieben.",
  icons: {
    icon: "/logo.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={barlowCondensed.variable}>
      <body className="antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
