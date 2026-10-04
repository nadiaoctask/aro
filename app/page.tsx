"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  LayoutDashboard, 
  Truck, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  PackageX,
  PackageCheck,
  Search
} from "lucide-react";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // State untuk menyimpan Role User
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // State Summary Armada
  const [fleetStats, setFleetStats] = useState({
    menunggu: 0,
    selesai: 0,
    avgLeadTime: "0 jam 0 menit"
  });

  // State Summary Replenishment (Sesi Terakhir)
  const [replenishStats, setReplenishStats] = useState({
    sufficient: 0,
    less: 0,
    zero: 0,
    review: 0,
    sessionId: "-"
  });

  // State Tabel Monitoring Pengiriman
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        setUserRole(profile?.role || null);
      }
    } catch (err) {
      console.error("Gagal mengambil role user:", err);
    }

    let latestFleetSesiId = null;

    try {
      const { data: fleets, error: fleetErr } = await supabase
        .from("optimized_fleet")
        .select("*")
        .order("created_at", { ascending: false });

      if (fleetErr) console.error("Error Armada:", fleetErr.message);

      if (fleets) {
        if (fleets.length > 0) latestFleetSesiId = fleets[0].id_sesi;

        let menunggu = 0;
        let selesai = 0;
        let totalMinutes = 0;
        let completedCount = 0;

        fleets.forEach((f: any) => {
          if (f.status === "Menunggu Picking") menunggu++;
          
          if (f.status === "Diterima Gudang Utama") {
            selesai++;
            if (f.completed_at && f.created_at) {
              const start = new Date(f.created_at).getTime();
              const end = new Date(f.completed_at).getTime();
              const diffMins = Math.round((end - start) / 60000);
              totalMinutes += diffMins;
              completedCount++;
            }
          }
        });

        let avgLT = "Belum ada data";
        if (completedCount > 0) {
          const avgMins = Math.round(totalMinutes / completedCount);
          avgLT = `${Math.floor(avgMins / 60)} jam${avgMins % 60} menit`;
        }

        setFleetStats({ menunggu, selesai, avgLeadTime: avgLT });
        setActiveDeliveries(fleets);
      }
    } catch (error) {
      console.error("Gagal proses armada:", error);
    }

    try {
      let targetSessionId = "-";
      
      const { data: sessions } = await supabase
        .from("replenishment")
        .select("id_sesi")
        .order("created_at", { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        targetSessionId = sessions[0].id_sesi;
      } else if (latestFleetSesiId) {
        targetSessionId = latestFleetSesiId;
      } else {
        const { data: lastDetail } = await supabase
          .from("detail_replenishment")
          .select("id_sesi")
          .limit(1);
        if (lastDetail && lastDetail.length > 0) {
          targetSessionId = lastDetail[0].id_sesi;
        }
      }

      if (targetSessionId !== "-") {
        const { data: details, error: detailErr } = await supabase
          .from("detail_replenishment")
          .select("status")
          .eq("id_sesi", targetSessionId);

        if (detailErr) console.error("Error Detail:", detailErr.message);

        if (details && details.length > 0) {
          let sufficient = 0, less = 0, zero = 0, review = 0;
          
          details.forEach((d: any) => {
            const st = String(d.status || "").toLowerCase();
            if (st.includes("zero") || st.includes("0")) zero++;
            else if (st.includes("less") || st.includes("kurang")) less++;
            else if (st.includes("review") || st.includes("cek")) review++;
            else sufficient++;
          });
          
          setReplenishStats({ sufficient, less, zero, review, sessionId: targetSessionId });
        } else {
          setReplenishStats(prev => ({ ...prev, sessionId: targetSessionId }));
        }
      }
    } catch (error) {
      console.error("Gagal proses status:", error);
    }
    
    setLoading(false);
  };

  if (loading) {
    return <div className="p-10 text-center font-bold text-[#114b79]">Menyiapkan Dashboard...</div>;
  }

  const isChecker = userRole === "checker";

  return (
    <div className="space-y-6">
      
      {/* KARTU STATISTIK UTAMA (Tampil untuk semua role) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
            <Truck size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Menunggu Picking</p>
            <h3 className="text-3xl font-extrabold text-slate-800">{fleetStats.menunggu} <span className="text-sm font-medium text-slate-500">Armada</span></h3>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full">
            <CheckCircle size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Selesai</p>
            <h3 className="text-3xl font-extrabold text-slate-800">{fleetStats.selesai} <span className="text-sm font-medium text-slate-500">Armada</span></h3>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 border-l-4 border-l-purple-500">
          <div className="p-4 bg-purple-50 text-purple-600 rounded-full">
            <Clock size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Avg. Lead Time</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1">{fleetStats.avgLeadTime}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PANEL KIRI: MONITORING ARMADA */}
        {/* Jika checker, penuhi layar (col-span-3). Jika tidak, pakai 2/3 layar (col-span-2) */}
        <div className={`${isChecker ? 'lg:col-span-3' : 'lg:col-span-2'} bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300`}>
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
            <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
              <Truck size={20} className="text-[#114b79]"/> Monitoring Pengiriman
            </h3>
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Cari Plat Nomor..." className="w-full pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm outline-none focus:border-[#114b79]" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-200">
                <tr>
                  <th className="px-5 py-4">Plat Nomor</th>
                  <th className="px-5 py-4">Muatan (Kg/Vol)</th>
                  <th className="px-5 py-4">Tgl Dibuat</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {activeDeliveries.map((fleet, i) => (
                  <tr key={fleet.id_optimasi} onClick={() => router.push(`/delivery/${fleet.id_optimasi}`)} className="border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer">
                    <td className="px-5 py-3 font-extrabold text-[#114b79]">{fleet.license_plate}</td>
                    <td className="px-5 py-3 font-medium">
                      {fleet.total_weight}kg / {fleet.total_volume}dm³
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(fleet.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-3 py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider whitespace-nowrap border ${
                        fleet.status === 'Diterima Gudang Utama' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                          : fleet.status === 'Dalam Perjalanan'
                          ? 'bg-blue-50 text-blue-600 border-blue-200'
                          : 'bg-amber-50 text-amber-600 border-amber-200'
                      }`}>
                        {fleet.status === 'Diterima Gudang Utama' 
                          ? 'Selesai' 
                          : fleet.status === 'Dalam Perjalanan' 
                          ? 'Dalam Perjalanan' 
                          : 'Menunggu Picking'}
                      </span>
                    </td>
                  </tr>
                ))}
                {activeDeliveries.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">Belum ada data armada keluar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PANEL KANAN: STATUS REPLENISHMENT */}
        {/* HANYA RENDER JIKA BUKAN CHECKER */}
        {!isChecker && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 bg-slate-50">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                <LayoutDashboard size={20} className="text-[#114b79]"/> Status Replenishment
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-mono">ID: {replenishStats.sessionId}</p>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <PackageX className="text-red-500" size={20} />
                  <span className="font-bold text-red-700 text-sm">Stok Kosong</span>
                </div>
                <span className="font-extrabold text-red-700 text-lg">{replenishStats.zero}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-amber-500" size={20} />
                  <span className="font-bold text-amber-700 text-sm">Stok Kurang</span>
                </div>
                <span className="font-extrabold text-amber-700 text-lg">{replenishStats.less}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <Search className="text-orange-500" size={20} />
                  <span className="font-bold text-orange-700 text-sm">Perlu Review SCM</span>
                </div>
                <span className="font-extrabold text-orange-700 text-lg">{replenishStats.review}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <PackageCheck className="text-emerald-500" size={20} />
                  <span className="font-bold text-emerald-700 text-sm">Stok Cukup</span>
                </div>
                <span className="font-extrabold text-emerald-700 text-lg">{replenishStats.sufficient}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}