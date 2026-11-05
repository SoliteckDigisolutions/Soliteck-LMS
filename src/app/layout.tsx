import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { getCompanySettings } from "@/lib/data";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Leave Management System",
  description:
    "Upload attendance workbooks, manage leave balances, and export employee leave reports in PDF.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const company = await getCompanySettings();

  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <AppShell
          company={{
            companyName: company.companyName,
            companyLogoUrl: company.companyLogoUrl,
          }}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}