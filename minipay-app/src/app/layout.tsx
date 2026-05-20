import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Cowry — Talk. Send. Automate.",
  description: "AI-powered crypto payments on Celo. Send money as easily as sending a message.",
  manifest:    "/manifest.json",
  openGraph: {
    title:       "Cowry — Talk. Send. Automate.",
    description: "AI-powered conversational crypto payments on Celo.",
    images:      [{ url: "/cowry.png" }],
  },
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor:   "#0A0F1E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <body className="h-full bg-cowry-dark font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
