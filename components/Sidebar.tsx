"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Database, 
  ShieldAlert, 
  Truck, 
  Calculator, 
  LayoutDashboard, 
  Package
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const masterDataLinks = [
    { name: "Data Material", href: "/material", icon: Database },
    { name: "Data Safety Stock", href: "/safety-stock", icon: ShieldAlert },
    { name: "Data Fleet", href: "/fleet", icon: Truck },
  ];

  const operationLinks = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Replenishment", href: "/replenishment", icon: Calculator },
    { name: "Fleet Optimization", href: "/optimasi", icon: Package },
    // Portal Checker disembunyikan sesuai request
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-20 shadow-sm">
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
        
        {/* MASTER DATA */}
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4 ml-3">
          Master Data
        </div>
        {masterDataLinks.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive 
                  ? "bg-[#114b79] text-white shadow-md" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <item.icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
              <span className="font-semibold text-sm">{item.name}</span>
            </Link>
          );
        })}

        {/* OPERATIONS */}
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-8 ml-3">
          Operations
        </div>
        {operationLinks.map((item) => {
          // PERBAIKAN LOGIKA AKTIF: Jika href adalah "/", pastikan pathnamenya benar-benar "/", bukan sekadar startsWith.
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive 
                  ? "bg-[#114b79] text-white shadow-md" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <item.icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
              <span className="font-semibold text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile Area */}
      <div className="p-4 border-t border-slate-100 flex items-center gap-3 bg-white">
        <div className="w-10 h-10 rounded-full bg-[#0b1320] text-white flex items-center justify-center font-bold shadow-sm">
          N
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Nadia</p>
          <p className="text-xs text-slate-500">Inventory Controller</p>
        </div>
      </div>
    </aside>
  );
}