import type { Metadata } from "next";
import { Anton, Work_Sans } from "next/font/google";
import "./globals.css";
import "./home-overrides.css";
import { BRAND, NAME } from "@/site";

const display = Anton({ weight: "400", subsets: ["latin"], variable: "--display" });
const body = Work_Sans({ subsets: ["latin"], variable: "--body" });

export const metadata: Metadata = {
  title: `${BRAND} by ${NAME}`,
  description: "Everything a 100 level student must know, from a first-class, scholarship, association president who builds software that pays.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
