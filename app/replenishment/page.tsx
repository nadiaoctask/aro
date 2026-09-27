"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Calculator, Download, ArrowRight } from "lucide-react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";

// Tipe data untuk hasil kalkulasi
interface CalculatedResult {
  material_id: string;
  description: string;
  available_stock: number;
  blocked_stock: number;
  x_days: number;
  safety_stock: number;
  transferred_stock: number;
  status: string;
  statusColor: string;
}

export default function ReplenishmentPage() {
  const router = useRouter();
  
  // State Input Parameter
  const [workDays, setWorkDays] = useState<number | "">("");
  const [replenishDays, setReplenishDays] = useState<number | "">("");

  // State File Excel
  const [fileZRW29, setFileZRW29] = useState<File | null>(null);
  const [fileZRW12, setFileZRW12] = useState<File | null>(null);
  const [fileSales, setFileSales] = useState<File | null>(null);

  // State Proses & Hasil
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [results, setResults] = useState<CalculatedResult[]>([]);

  // Utility untuk membaca Excel menjadi Array 2 Dimensi
  const readExcel = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          resolve(json);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleCalculate = async () => {
    if (!fileZRW29 || !fileZRW12 || !fileSales || !workDays || !replenishDays) {
      alert("Harap lengkapi semua file Excel dan parameter hari!");
      return;
    }

    setIsCalculating(true);

    try {
      const [salesRaw, zrw29Raw, zrw12Raw] = await Promise.all([
        readExcel(fileSales),
        readExcel(fileZRW29),
        readExcel(fileZRW12)
      ]);

      const salesData = salesRaw.slice(5); 
      const zrw29Data = zrw29Raw.slice(1); 
      const zrw12Data = zrw12Raw.slice(1); 

      const { data: dbMaterials } = await supabase.from("material").select("material_id, description");
      const { data: dbSafetyStocks } = await supabase.from("safety_stock").select("material_id, safety_stock");
      
      const masterMaterialMap = new Map(dbMaterials?.map((m) => [m.material_id, m.description]));
      const masterSafetyMap = new Map(dbSafetyStocks?.map((s) => [s.material_id, s.safety_stock]));

      const stockA001: Record<string, number> = {};
      const blockedA001: Record<string, number> = {};
      const existA001: Record<string, boolean> = {};

      zrw29Data.forEach(row => {
        if (!row || row.length === 0) return;
        const mid = String(row[0] || "").trim();
        if (mid) {
          existA001[mid] = true;
          stockA001[mid] = parseFloat(row[6]) || 0;
          blockedA001[mid] = parseFloat(row[10]) || 0;
        }
      });

      const stockA002: Record<string, number> = {};
      const existA002: Record<string, boolean> = {};

      zrw12Data.forEach(row => {
        if (!row || row.length === 0) return;
        const mid = String(row[1] || "").trim();
        if (mid) {
          existA002[mid] = true;
          stockA002[mid] = parseFloat(row[7]) || 0;
        }
      });

      const outputData: CalculatedResult[] = [];

      salesData.forEach(row => {
        if (!row || row.length === 0) return;
        const mid = String(row[0] || "").trim();
        if (!mid) return;

        if (!masterMaterialMap.has(mid)) return;

        const deliv1 = parseFloat(row[9]) || 0;
        const deliv2 = parseFloat(row[10]) || 0;
        const deliv3 = parseFloat(row[11]) || 0;
        const totaldeliv = deliv1 + deliv2 + deliv3;
        const dailydeliv = totaldeliv / Number(workDays);
        
        const currentStockA001 = stockA001[mid] || 0;
        const currentBlockedA001 = blockedA001[mid] || 0;
        const isExistA001 = existA001[mid] || false;
        const isExistA002 = existA002[mid] || false;
        
        const x_days = (dailydeliv > 0) ? (currentStockA001 / dailydeliv) : 999;
        
        if (x_days < 3) {
          const reqDays = Math.ceil(dailydeliv * Number(replenishDays));
          const currentStockA002 = stockA002[mid] || 0;
          
          let transferQty = 0;
          let status = "";
          let statusColor = "";
          
          if (!isExistA001 && !isExistA002) {
            status = "Need Review SCM";
            statusColor = "bg-[#fce5cd] text-[#b45f06]"; 
            transferQty = 0;
          } else if (currentStockA002 === 0) {
            status = "Zero stock left";
            statusColor = "bg-[#f4cccc] text-[#cc0000]"; 
            transferQty = 0;
          } else if (currentStockA002 < reqDays) {
            status = "Less than needed stock";
            statusColor = "bg-[#fff2cc] text-[#b45f06]"; 
            transferQty = currentStockA002; 
          } else {
            status = "Sufficient";
            statusColor = "bg-[#d9ead3] text-[#38761d]"; 
            transferQty = reqDays;
          }
          
          outputData.push({
            material_id: mid,
            description: masterMaterialMap.get(mid) || "No Description",
            available_stock: currentStockA001,
            blocked_stock: currentBlockedA001,
            x_days: Number(x_days.toFixed(2)),
            safety_stock: masterSafetyMap.get(mid) || 0,
            transferred_stock: transferQty,
            status: status,
            statusColor: statusColor
          });
        }
      });

      setResults(outputData);
      if (outputData.length === 0) {
        alert("Tidak ada material yang butuh direplenish (semua X-Days >= 3 atau tidak ada di master).");
      }
    } catch (error: any) {
      alert("Error saat kalkulasi: " + error.message);
    }
    
    setIsCalculating(false);
  };

  // Logic Gabungan: Simpan ke DB -> Redirect ke Optimasi
  const handleTransfer = async () => {
    if (results.length === 0) return;
    
    setIsTransferring(true);
    try {
      // 1. Simpan Header Sesi
      const { data: sessionData, error: sessionError } = await supabase
        .from("replenishment")
        .insert([{ jml_hari_kerja: workDays, jml_hari_replenish: replenishDays }])
        .select("id_sesi")
        .single();
        
      if (sessionError) throw sessionError;
      const newSessionId = sessionData.id_sesi;

      // 2. Siapkan Detail Data
      const detailPayload = results.map(item => ({
        id_sesi: newSessionId,
        material_id: item.material_id,
        available_stock: item.available_stock,
        blocked_stock: item.blocked_stock,
        x_days: item.x_days,
        transferred_stock: item.transferred_stock,
        status: item.status
      }));

      // 3. Simpan Detail secara Batch
      const chunkSize = 1000;
      for (let i = 0; i < detailPayload.length; i += chunkSize) {
        const chunk = detailPayload.slice(i, i + chunkSize);
        const { error: detailError } = await supabase.from("detail_replenishment").insert(chunk);
        if (detailError) throw detailError;
      }

      // 4. Sukses tersimpan? Langsung pindah ke halaman Optimasi dengan membawa ID Sesi
      router.push(`/optimasi?session_id=${newSessionId}`);

    } catch (error: any) {
      alert("Gagal memproses data ke database: " + error.message);
      setIsTransferring(false);
    }
  };

  const handleDownloadExcel = () => {
    if (results.length === 0) return;
    
    const exportData = results.map(r => ({
      "MID": r.material_id,
      "Material Description": r.description,
      "Available Stock (A001)": r.available_stock,
      "Blocked Stock (A001)": r.blocked_stock,
      "Safety Stock": r.safety_stock,
      "X-Days": r.x_days,
      "Transferred Stock": r.transferred_stock,
      "Status": r.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Replenishment Result");
    XLSX.writeFile(workbook, `Replenishment_Result_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[#114b79] uppercase tracking-wide flex items-center gap-2">
            Automated Replenishment 
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1"></p>
        </div>
      </div>

      {/* INPUT FORM */}
      <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        
        <div className="lg:col-span-1 space-y-4 border-r border-slate-100 pr-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Jumlah Hari Kerja (3 Bulan)</label>
            <input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value ? Number(e.target.value) : "")} className="w-full border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-[#114b79] outline-none" placeholder="Misal: 80" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Kebutuhan Replenishment</label>
            <input type="number" value={replenishDays} onChange={(e) => setReplenishDays(e.target.value ? Number(e.target.value) : "")} className="w-full border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-[#114b79] outline-none" placeholder="Misal: 3" />
          </div>
        </div>

        <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-300 p-4 rounded-md bg-slate-50 relative group hover:border-[#114b79] transition-all">
            <h4 className="font-bold text-[#114b79] text-sm mb-1">ZRW29 A001</h4>
            <p className="text-xs text-slate-500 mb-3">Upload Stok Gudang Utama</p>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFileZRW29(e.target.files?.[0] || null)} className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#114b79] file:text-white hover:file:bg-[#0c3659] cursor-pointer" />
          </div>
          <div className="border border-slate-300 p-4 rounded-md bg-slate-50 relative group hover:border-[#114b79] transition-all">
            <h4 className="font-bold text-[#114b79] text-sm mb-1">ZRW12 A002</h4>
            <p className="text-xs text-slate-500 mb-3">Upload Stok Gudang Sewa</p>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFileZRW12(e.target.files?.[0] || null)} className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#114b79] file:text-white hover:file:bg-[#0c3659] cursor-pointer" />
          </div>
          <div className="border border-slate-300 p-4 rounded-md bg-slate-50 relative group hover:border-[#114b79] transition-all">
            <h4 className="font-bold text-[#114b79] text-sm mb-1">Data Delivery</h4>
            <p className="text-xs text-slate-500 mb-3">Upload Data DO 3 Bulan Terakhir</p>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFileSales(e.target.files?.[0] || null)} className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#114b79] file:text-white hover:file:bg-[#0c3659] cursor-pointer" />
          </div>
        </div>

        <div className="lg:col-span-5 pt-4 border-t border-slate-200">
          <button onClick={handleCalculate} disabled={isCalculating} className="w-full py-3.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm disabled:bg-slate-400 flex justify-center items-center gap-2">
            <Calculator size={20} />
            {isCalculating ? "Menghitung & Memproses Data..." : "Calculate"}
          </button>
        </div>
      </div>

      {/* HASIL KALKULASI & ACTION BUTTONS */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 gap-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#114b79] uppercase">Hasil Kalkulasi</h3>
              <p className="text-sm text-slate-500 font-medium">Ditemukan {results.length} material yang perlu direplenish (X-Days {'<'} 3).</p>
            </div>
            
            {/* Action Buttons: Cuma 2 Tombol, Download dan Transfer */}
            <div className="flex gap-3">
              <button onClick={handleDownloadExcel} className="flex items-center gap-2 px-5 py-2.5 bg-[#3b824a] text-white font-bold rounded-md hover:bg-[#2e663a] transition-colors shadow-sm">
                <Download size={18} /> Download Excel
              </button>
              
              <button onClick={handleTransfer} disabled={isTransferring} className="flex items-center gap-2 px-5 py-2.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm disabled:bg-slate-400">
                {isTransferring ? "Memproses Data..." : "Transfer"} <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="border border-slate-300 rounded-md overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-white uppercase bg-[#114b79] sticky top-0 z-10 text-center">
                <tr>
                  <th className="px-4 py-3 border-r border-[#0c3659]">MID</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] text-left">Description</th>
                  <th className="px-4 py-3 border-r border-[#0c3659]">Avail (A001)</th>
                  <th className="px-4 py-3 border-r border-[#0c3659]">Block (A001)</th>
                  <th className="px-4 py-3 border-r border-[#0c3659]">Safety</th>
                  <th className="px-4 py-3 border-r border-[#0c3659]">X-Days</th>
                  <th className="px-4 py-3 border-r border-[#0c3659]">Transfer Qty</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {results.map((r, index) => (
                  <tr key={r.material_id} className={`border-b border-slate-200 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50`}>
                    <td className="px-4 py-2 font-bold text-center">{r.material_id}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.description}</td>
                    <td className="px-4 py-2 text-center">{r.available_stock}</td>
                    <td className="px-4 py-2 text-center text-red-600">{r.blocked_stock}</td>
                    <td className="px-4 py-2 text-center">{r.safety_stock}</td>
                    <td className="px-4 py-2 text-center font-bold text-[#114b79]">{r.x_days}</td>
                    <td className="px-4 py-2 text-center font-bold text-[#3b824a]">{r.transferred_stock}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap ${r.statusColor}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}