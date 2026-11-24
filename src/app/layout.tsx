import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wordwise — your daily vocabulary practice",
  description: "Build your vocabulary with five useful words every day.",
  applicationName: "Wordwise",
};

export const viewport: Viewport = { themeColor: "#f7f5f0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
