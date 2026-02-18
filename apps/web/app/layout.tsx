import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spawn — One-Click Deploy",
  description: "AI-powered deploy platform with self-healing",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
