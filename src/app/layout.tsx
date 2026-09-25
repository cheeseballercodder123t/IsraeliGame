import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conglomerate: Gilded Age",
  description:
    "An asynchronous industrial empire and corporate warfare simulator. One hundred and twenty one plots, seventy five commodities, sixty four orders, and a newspaper that prints what you did.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Bitter:wght@400;600;800&display=swap"
        />
      </head>
      <body className="grain relative min-h-screen bg-void text-ink antialiased">{children}</body>
    </html>
  );
}
