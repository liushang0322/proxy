import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "VPN Control",
  description: "Private admin panel for vpn.lshang.top"
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

