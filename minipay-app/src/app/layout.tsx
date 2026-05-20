import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Cowry — Send money as easily as a message",
  description: "AI-powered crypto payments on Celo via MiniPay",
  manifest:    "/manifest.json",
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor:   "#1A3C2E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-cowry-surface font-sans antialiased">
        <main className="h-full flex flex-col max-w-md mx-auto bg-white shadow-sm">
          {children}
        </main>
      </body>
    </html>
  );
}
