import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NoWheel } from "./no-wheel";

export const metadata: Metadata = {
  title: "Quản lý nhà trọ",
  description: "Tính tiền, thu tiền và theo dõi công nợ nhà trọ",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2b72cf" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-cream text-gray-900 antialiased"><NoWheel />{children}</body>
    </html>
  );
}
