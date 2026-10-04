import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Automated Replenishment Optimization",
  description: "built for Medan Distribusindo Raya",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* HAPUS class "flex" di sini agar halaman login tidak gepeng ke kiri */}
      <body className={`${inter.className} bg-[#f0f2f5] text-slate-800 min-h-screen`}>
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}