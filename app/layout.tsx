import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevVerse",
  description: "An interactive developer kingdom generated from coding activity."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
