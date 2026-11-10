import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Event bewerten",
  robots: { index: false, follow: false },
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
