"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const pathname = usePathname();

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        setRole(data?.role || null);
      }
      setLoading(false);
    };

    fetchRole();
  }, [pathname]);

  // ==========================================
  // TAMPILAN 1: HALAMAN LOGIN / REGISTER
  // ==========================================
  if (pathname === "/login" || pathname === "/register") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-100">
        {children}
      </div>
    );
  }

  // ==========================================
  // TAMPILAN 2: HALAMAN DASHBOARD UTAMA
  // ==========================================
  const isChecker = role === "checker";
  const showSidebar = !loading && !isChecker && role !== null;

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar hanya dirender jika memenuhi syarat */}
      {showSidebar && <Sidebar />}
      
      {/* Konten Utama */}
      <main className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-8 transition-all duration-300 ${showSidebar ? 'ml-64' : 'ml-0'}`}>
        <header className="mb-8 flex justify-between items-end border-b border-slate-300 pb-4">
          <h2 className="text-3xl font-extrabold text-[#114b79]">Automated Replenishment Optimization</h2>
        </header>
        
        {children}
      </main>
    </div>
  );
}