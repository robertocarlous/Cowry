import type { Viewport } from "next";

export const viewport: Viewport = {
  maximumScale: 1,
  userScalable: false,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col max-w-md mx-auto bg-white shadow-sm">
      {children}
    </div>
  );
}
