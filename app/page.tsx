import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, Database, Truck, ShieldAlert, Calculator } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Automated Replenishment Optimization",
  description: "built for Medan Distribusindo Raya",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#f0f2f5] text-slate-800 flex min-h-screen`}>
        
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 shadow-sm">
          {/* Logo Area */}
          <div className="h-20 flex items-center justify-center border-b border-slate-100">
            <img 
              src="/logo Wings.svg" 
              alt="Logo Wings" 
              className="h-12 w-auto object-contain"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4 ml-3">
              Master Data
            </div>
            
            <Link href="/material" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <Database size={18} />
              <span className="font-semibold text-sm">Data Material</span>
            </Link>
            
            <Link href="/safety-stock" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <ShieldAlert size={18} />
              <span className="font-semibold text-sm">Data Safety Stock</span>
            </Link>

            <Link href="/fleet" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <Truck size={18} />
              <span className="font-semibold text-sm">Data Fleet</span>
            </Link>

            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-8 ml-3">
              Operations
            </div>

            {/* Menu Aktif (Contoh Style Biru Gelap) */}
            <Link href="/replenishment" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#114b79] text-white shadow-md transition-colors">
              <Calculator size={18} />
              <span className="font-semibold text-sm">Replenishment</span>
            </Link>
          </nav>

          {/* User Profile Area */}
          <div className="p-4 border-t border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#114b79] text-white flex items-center justify-center font-bold">
              ADM
            </div>
            <div>
              <p className="text-sm font-bold">Admin SCM</p>
              <p className="text-xs text-slate-500">Supervisor</p>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 ml-64 p-8">
          {/* Top Header Placeholder */}
          <header className="mb-8 flex justify-between items-end border-b border-slate-300 pb-4">
            <h2 className="text-3xl font-extrabold text-[#114b79]">Automated Replenishment Optimization</h2>
          </header>
          
          {children}
        </main>

      </body>
    </html>
  );
}