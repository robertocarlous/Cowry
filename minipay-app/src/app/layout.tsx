import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Cowry — Talk. Send. Automate.",
  description: "AI-powered crypto payments on Celo. Send money as easily as sending a message.",
  manifest:    "/manifest.json",
  // PWA / MiniPay in-app browser
  appleWebApp: {
    capable:       true,
    statusBarStyle: "black-translucent",
    title:         "Cowry",
  },
  openGraph: {
    title:       "Cowry — Talk. Send. Automate.",
    description: "AI-powered conversational crypto payments on Celo.",
    images:      [{ url: "/cowry.png" }],
  },
};

export const viewport: Viewport = {
  width:            "device-width",
  initialScale:     1,
  maximumScale:     1,
  userScalable:     false,   // prevent accidental pinch-zoom inside MiniPay
  viewportFit:      "cover", // respect notch / safe-area on all phones
  themeColor:       "#0A0F1E",
  colorScheme:      "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full overflow-hidden bg-cowry-dark font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
