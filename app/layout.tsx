import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "404宿舍：夜间监控",
  description: "在宿舍值班室里守到清晨。看监控、查手机、上报异常。",
  icons: { icon: "/game/favicon.svg", shortcut: "/game/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
