import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weather Vibes",
  description: "Chat with a weather agent and feel the atmosphere",
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
