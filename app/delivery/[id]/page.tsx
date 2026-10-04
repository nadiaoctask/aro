"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  ArrowLeft, 
  Truck, 
  Package, 
  User, 
  Building,
  CheckCircle,
  MapPin,
  Clock,
  Weight,
  Box
} from "lucide-react";

export default function DeliveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [fleetHeader, setFleetHeader] = useState<any>(null);
  const [fleetDetails, setFleetDetails] = useState<any[]>([]);

  useEffect(() => {
    if (id) fetchDeliveryDetail();
  }, [id]);

  const fetchDeliveryDetail = async () => {
    setLoading(true);
    try {
      // 1. Ambil Header Armada + Relasi ke tabel Master Fleet
      const { data: headerData, error: headerErr } = await supabase
        .from("optimized_fleet")
        .select(`
          *,
          fleet (
            shipp_type,
            vendor,
            driver,
            volume_capacity,
            weight_capacity
          )
        `)
        .eq("id_optimasi", id)
        .single();

      if (headerErr) throw headerErr;
      setFleetHeader(headerData);

      // 2. Ambil Rincian Barang
      const { data: detailData, error: detailErr } = await supabase
        .from("detail_optimasi")
        .select(`
          material_id, 
          qty_transferred,
          material (description)
        `)
        .eq("id_optimasi", id);

      if (detailErr) throw detailErr;
      setFleetDetails(detailData || []);

    } catch (error: any) {
      alert("Gagal memuat data: " + error.message);
    }
    setLoading(false);
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setUpdating(true);
    
    try {
      const payload: any = { status: newStatus };
      
      // Jika statusnya Diterima, catat waktu selesainya
      if (newStatus === "Diterima Gudang Utama") {
        payload.completed_at = new Date().toISOString();
      } else {
        payload.completed_at = null; // Reset jika status mundur
      }

      const { error } = await supabase
        .from("optimized_fleet")
        .update(payload)
        .eq("id_optimasi", id);

      if (error) throw error;
      
      setFleetHeader({ ...fleetHeader, status: newStatus, completed_at: payload.completed_at });
      
    } catch (err: any) {
      alert("Gagal mengupdate status: " + err.message);
    }
    setUpdating(false);
  };

  if (loading) return <div className="p-10 text-center font-bold text-[#114b79]">Memuat Surat Jalan...</div>;
  if (!fleetHeader) return <div className="p-10 text-center text-red-500">Data tidak ditemukan!</div>;

  const fleetMaster = fleetHeader.fleet || {};
  const weightPct = fleetMaster.weight_capacity ? ((fleetHeader.total_weight / fleetMaster.weight_capacity) * 100).toFixed(1) : 0;
  const volPct = fleetMaster.volume_capacity ? ((fleetHeader.total_volume / fleetMaster.volume_capacity) * 100).toFixed(1) : 0;

  // Warna dinamis untuk status
  let statusColor = "bg-amber-100 text-amber-800 border-amber-300";
  if (fleetHeader.status === "Dalam Perjalanan") statusColor = "bg-blue-100 text-blue-800 border-blue-300";
  if (fleetHeader.status === "Diterima Gudang Utama") statusColor = "bg-emerald-100 text-emerald-800 border-emerald-300";

  return (
    <div className="space-y-6">
      
      {/* TOMBOL KEMBALI */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.back()} 
          className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"
        >
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-2xl font-extrabold text-[#114b79]">Detail Pengiriman</h2>
          <p className="text-sm text-slate-500 font-mono">ID Optimasi: {id}</p>
        </div>
      </div>

      {/* HEADER: INFO KENDARAAN (KOP SURAT) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Bagian Atas: Info Dasar & Dropdown Status */}
        <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50 border-b border-slate-200">
          
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-[#114b79] text-white rounded-xl flex items-center justify-center shadow-md">
              <Truck size={32} />
            </div>
            <div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{fleetHeader.license_plate}</h3>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-sm font-medium text-slate-600">
                <span className="flex items-center gap-1.5"><Package size={16} className="text-slate-400"/> {fleetMaster.shipp_type || "-"}</span>
                <span className="flex items-center gap-1.5"><Building size={16} className="text-slate-400"/> {fleetMaster.vendor || "-"}</span>
                <span className="flex items-center gap-1.5"><User size={16} className="text-slate-400"/> {fleetMaster.driver || "Driver TBA"}</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1.5">Status Pengiriman</p>
            <select 
              value={fleetHeader.status}
              onChange={handleStatusChange}
              disabled={updating}
              className={`w-full p-2.5 rounded-md border font-extrabold outline-none cursor-pointer transition-colors ${statusColor}`}
            >
              <option value="Menunggu Picking">Menunggu Picking</option>
              <option value="Dalam Perjalanan">Dalam Perjalanan</option>
              <option value="Diterima Gudang Utama">Selesai</option>
            </select>
            {fleetHeader.completed_at && (
              <p className="text-[11px] text-slate-500 mt-2 text-right">
                Tiba: {new Date(fleetHeader.completed_at).toLocaleString('id-ID')}
              </p>
            )}
          </div>
        </div>

        {/* Bagian Bawah: Kapasitas Muatan */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Utilitas Berat */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className="font-bold text-slate-600 flex items-center gap-2"><Weight size={18}/> Muatan Berat (Kg)</span>
              <span className="text-sm font-extrabold text-[#114b79]">
                {fleetHeader.total_weight} <span className="text-slate-400 font-normal">/ {fleetMaster.weight_capacity || "-"} kg</span>
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div 
                className="bg-[#114b79] h-3 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(Number(weightPct), 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-slate-500 mt-1 text-right font-medium">Utilitas: {weightPct}%</p>
          </div>

          {/* Utilitas Volume */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className="font-bold text-slate-600 flex items-center gap-2"><Box size={18}/> Muatan Volume (dm³)</span>
              <span className="text-sm font-extrabold text-[#3b824a]">
                {fleetHeader.total_volume} <span className="text-slate-400 font-normal">/ {fleetMaster.volume_capacity || "-"} dm³</span>
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div 
                className="bg-[#3b824a] h-3 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(Number(volPct), 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-slate-500 mt-1 text-right font-medium">Utilitas: {volPct}%</p>
          </div>

        </div>
      </div>

      {/* TABEL: DAFTAR BARANG (BODY SURAT) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
            <Package size={20} className="text-[#114b79]"/> Daftar Muatan
          </h3>
          <span className="text-xs font-bold bg-slate-100 text-slate-600 px-3 py-1 rounded-full border border-slate-200">
            Total {fleetDetails.length} Item
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 w-16 text-center">No</th>
                <th className="px-6 py-4">Material ID</th>
                <th className="px-6 py-4">Deskripsi Barang</th>
                <th className="px-6 py-4 text-center">Qty Dikirim (Box)</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {fleetDetails.map((item, index) => (
                <tr key={item.material_id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-400 text-center">{index + 1}</td>
                  <td className="px-6 py-4 font-extrabold text-[#114b79]">{item.material_id}</td>
                  <td className="px-6 py-4 font-medium">{item.material?.description || "-"}</td>
                  <td className="px-6 py-4 text-center font-black text-lg">
                    {item.qty_transferred}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}