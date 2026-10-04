"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Calculator, Download, ArrowRight, Plus, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";

interface CalculatedResult {
  material_id: string;
  description: string;
  available_stock: number;
  blocked_stock: number;
  x_days: number;
  safety_stock: number;
  transferred_stock_box: number; 
  max_transfer_box: number; 
  min_transfer_box_limit: number; // Syarat MOQ
  status: string;
  statusColor: string;
  isManual?: boolean;
}

export default function ReplenishmentPage() {
  const router = useRouter();
  
  const [workDays, setWorkDays] = useState<number | "">("");
  const [replenishDays, setReplenishDays] = useState<number | "">("");

  const [fileZRW29, setFileZRW29] = useState<File | null>(null);
  const [fileZRW12, setFileZRW12] = useState<File | null>(null);
  const [fileSales, setFileSales] = useState<File | null>(null);

  const [allMaterials, setAllMaterials] = useState<any[]>([]); 
  const [stockA002Map, setStockA002Map] = useState<Record<string, number>>({});
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [results, setResults] = useState<CalculatedResult[]>([]);

  const [manualMid, setManualMid] = useState("");
  const [manualQtyBox, setManualQtyBox] = useState("");

  useEffect(() => {
    fetchMasterMaterials();
  }, []);

  const fetchMasterMaterials = async () => {
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("material")
          .select("material_id, description, pcs_per_pal, pcs_per_box")
          .range(from, from + step - 1);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      setAllMaterials(allData);
    } catch (err) {
      console.error("Gagal memuat material master:", err);
    }
  };

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

  // Pembersih MID: Hapus spasi dan nol di depan agar tidak miss-match
  const cleanMid = (val: any) => String(val || "").replace(/^0+/, '').trim().toUpperCase();

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

      const { data: dbSafetyStocks } = await supabase.from("safety_stock").select("material_id, safety_stock");
      
      const masterMaterialMap = new Map(allMaterials.map((m) => [cleanMid(m.material_id), m]));
      const masterSafetyMap = new Map(dbSafetyStocks?.map((s) => [cleanMid(s.material_id), s.safety_stock]));

      const stockA001: Record<string, number> = {};
      const blockedA001: Record<string, number> = {};
      const existA001: Record<string, boolean> = {};

      // PENTING: Gunakan penambahan (+) untuk mengakumulasi jika 1 material punya banyak Batch/Row
      zrw29Data.forEach(row => {
        if (!row || row.length === 0) return;
        const mid = cleanMid(row[0]);
        if (mid) {
          existA001[mid] = true;
          stockA001[mid] = (stockA001[mid] || 0) + (parseFloat(row[6]) || 0);
          blockedA001[mid] = (blockedA001[mid] || 0) + (parseFloat(row[10]) || 0);
        }
      });

      const stockA002: Record<string, number> = {};
      const existA002: Record<string, boolean> = {};

      zrw12Data.forEach(row => {
        if (!row || row.length === 0) return;
        const mid = cleanMid(row[1]);
        if (mid) {
          existA002[mid] = true;
          stockA002[mid] = (stockA002[mid] || 0) + (parseFloat(row[7]) || 0);
        }
      });

      // Simpan Map A002 agar fitur Tambah Manual bisa mendeteksi Max Qty dengan akurat
      setStockA002Map(stockA002);

      const outputData: CalculatedResult[] = [];

      // Proses perbandingan data
      salesData.forEach(row => {
        if (!row || row.length === 0) return;
        const mid = cleanMid(row[0]);
        if (!mid) return;

        if (!masterMaterialMap.has(mid)) return;

        const deliv1 = parseFloat(row[9]) || 0;
        const deliv2 = parseFloat(row[10]) || 0;
        const deliv3 = parseFloat(row[11]) || 0;
        const totaldeliv = deliv1 + deliv2 + deliv3;
        const dailydeliv = totaldeliv / Number(workDays); // Box per day
        
        const currentStockA001 = stockA001[mid] || 0;
        const currentBlockedA001 = blockedA001[mid] || 0;
        const isExistA001 = existA001[mid] || false;
        const isExistA002 = existA002[mid] || false;
        
        const x_days = (dailydeliv > 0) ? (currentStockA001 / dailydeliv) : 999;
        
        if (x_days < 3) {
          const reqDaysBox = Math.ceil(dailydeliv * Number(replenishDays));
          const currentStockA002 = stockA002[mid] || 0;
          
          let transferQtyBox = 0;
          let status = "";
          let statusColor = "";
          
          if (!isExistA001 && !isExistA002) {
            status = "Perlu Review SCM";
            statusColor = "bg-orange-50 text-orange-700 border border-orange-200"; 
            transferQtyBox = 0;
          } else if (currentStockA002 === 0) {
            status = "Stok Kosong";
            statusColor = "bg-red-50 text-red-700 border border-red-200"; 
            transferQtyBox = 0;
          } else if (currentStockA002 < reqDaysBox) {
            status = "Stok Kurang";
            statusColor = "bg-amber-50 text-amber-700 border border-amber-200"; 
            transferQtyBox = currentStockA002; 
          } else {
            status = "Stok Cukup";
            statusColor = "bg-emerald-50 text-emerald-700 border border-emerald-200"; 
            transferQtyBox = reqDaysBox;
          }

          const mat = masterMaterialMap.get(mid);
          const pcs_per_pal = mat?.pcs_per_pal || 1;
          const pcs_per_box = mat?.pcs_per_box || 1;
          
          // Syarat MOQ: Setengah Palet dalam Satuan Box
          const min_transfer_boxes = Math.ceil((pcs_per_pal / pcs_per_box) / 2);
          const maxBoxAvailable = currentStockA002;

          if (transferQtyBox > maxBoxAvailable) {
            transferQtyBox = maxBoxAvailable;
          }
          
          outputData.push({
            material_id: mid,
            description: mat.description || "No Description",
            available_stock: currentStockA001,
            blocked_stock: currentBlockedA001,
            x_days: Number(x_days.toFixed(2)),
            safety_stock: masterSafetyMap.get(mid) || 0,
            transferred_stock_box: transferQtyBox,
            max_transfer_box: maxBoxAvailable,
            min_transfer_box_limit: min_transfer_boxes,
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

  const handleEditQty = (mid: string, newQtyBox: number) => {
    setResults(prev => prev.map(r => {
      if (r.material_id === mid) {
        let validQty = newQtyBox < 0 ? 0 : newQtyBox;
        
        if (validQty > r.max_transfer_box) {
          validQty = r.max_transfer_box;
          alert(`Maksimal transfer untuk MID ${mid} adalah ${r.max_transfer_box} Box (Stok ZRW12)`);
        }
        
        return {
          ...r,
          transferred_stock_box: validQty,
          status: "Sesuai Permintaan",
          statusColor: "bg-blue-50 text-[#114b79] border border-blue-200",
          x_days: 0.1, 
          isManual: true
        };
      }
      return r;
    }));
  };

  const manualMat = allMaterials.find(m => cleanMid(m.material_id) === cleanMid(manualMid));
  const manualMaxBox = stockA002Map[cleanMid(manualMid)] || 0; 
  
  const manualPcsPerPal = manualMat?.pcs_per_pal || 1;
  const manualPcsPerBox = manualMat?.pcs_per_box || 1;
  const manualMinBoxLimit = Math.ceil((manualPcsPerPal / manualPcsPerBox) / 2);

  const handleAddManual = () => {
    if (Object.keys(stockA002Map).length === 0) {
      return alert("Silakan Calculate Auto Replenishment dahulu agar sistem mengenali data ZRW12!");
    }
    
    if (!manualMid || !manualQtyBox) return alert("Silakan isi MID dan Qty terlebih dahulu!");
    if (!manualMat) return alert("MID tidak ditemukan di Master Material!");

    const newQtyBox = Number(manualQtyBox);
    
    if (newQtyBox > manualMaxBox) {
      return alert(`Gagal! Stok di ZRW12 (A002) hanya tersisa ${manualMaxBox} Box.`);
    }
    
    setResults(prev => {
      const existing = prev.find(r => r.material_id === cleanMid(manualMid));
      if (existing) {
        return prev.map(r => r.material_id === cleanMid(manualMid) ? {
          ...r, 
          transferred_stock_box: newQtyBox,
          status: "Sesuai Permintaan",
          statusColor: "bg-blue-50 text-[#114b79] border border-blue-200",
          x_days: 0.1,
          isManual: true
        } : r);
      } else {
        return [{
          material_id: cleanMid(manualMat.material_id),
          description: manualMat.description,
          available_stock: 0, 
          blocked_stock: 0,
          safety_stock: 0,
          x_days: 0.1, 
          transferred_stock_box: newQtyBox,
          max_transfer_box: manualMaxBox,
          min_transfer_box_limit: manualMinBoxLimit,
          status: "Sesuai Permintaan",
          statusColor: "bg-blue-50 text-[#114b79] border border-blue-200",
          isManual: true
        }, ...prev];
      }
    });

    setManualMid("");
    setManualQtyBox("");
  };

  const handleTransfer = async () => {
    const itemsToTransfer = results.filter(item => {
      if (item.transferred_stock_box <= 0) return false;
      if (item.isManual) return true;
      return item.transferred_stock_box >= item.min_transfer_box_limit;
    });

    if (itemsToTransfer.length === 0) {
      alert("Tidak ada material yang siap ditransfer (Semua Qty 0 atau di bawah MOQ 1/2 Palet).");
      return;
    }

    const skippedCount = results.length - itemsToTransfer.length;
    if (skippedCount > 0) {
      const proceed = confirm(`Terdapat ${skippedCount} material yang akan DIABAIKAN karena Qty kurang dari MOQ (1/2 Palet).\n\nLanjut simpan ${itemsToTransfer.length} material valid ke database?`);
      if (!proceed) return;
    }
    
    setIsTransferring(true);
    
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from("replenishment")
        .insert([{ jml_hari_kerja: workDays, jml_hari_replenish: replenishDays }])
        .select("id_sesi")
        .single();
        
      if (sessionError) {
        console.error(
          "Session error:",
          sessionError.code,
          sessionError.message,
          sessionError.details,
          sessionError.hint
        );

        throw sessionError;
      }
      const newSessionId = sessionData.id_sesi;

      const detailPayload = itemsToTransfer.map(item => ({
        id_sesi: newSessionId,
        material_id: String(item.material_id),
        available_stock: Number(item.available_stock) || 0,
        blocked_stock: Number(item.blocked_stock) || 0,
        x_days: Number(item.x_days) || 0,
        transferred_stock: Number(item.transferred_stock_box) || 0, 
        status: String(item.isManual ? "Sesuai Permintaan" : item.status)
      }));

      const chunkSize = 1000;
      for (let i = 0; i < detailPayload.length; i += chunkSize) {
        const chunk = detailPayload.slice(i, i + chunkSize);
        const { error: detailError } = await supabase.from("detail_replenishment").insert(chunk);
        if (detailError) throw detailError;
      }

      router.push(`/optimasi?session_id=${newSessionId}`);

    } catch (error: any) {
      console.error("Error saat insert:", error);
      alert("Gagal memproses data ke database: " + error.message);
    } finally {
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
      "Transfer Qty (Box)": r.transferred_stock_box,
      "Max ZRW12 (Box)": r.max_transfer_box,
      "Syarat MOQ 1/2 Palet (Box)": r.min_transfer_box_limit,
      "Status": r.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Replenishment Result");
    XLSX.writeFile(workbook, `Replenishment_Result_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">    
      {/* INPUT FORM */}
      <div className="w-full max-w-full min-w-0 bg-white rounded-lg shadow-sm border border-slate-200 p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,4fr)] gap-6">
        <div className="min-w-0 space-y-4 lg:border-r border-slate-100 lg:pr-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Hari Kerja (3 Bulan)</label>
            <input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value ? Number(e.target.value) : "")} className="w-full border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-[#114b79] outline-none" placeholder="Misal: 80" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Kebutuhan Replenish</label>
            <input type="number" value={replenishDays} onChange={(e) => setReplenishDays(e.target.value ? Number(e.target.value) : "")} className="w-full border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-[#114b79] outline-none" placeholder="Misal: 3" />
          </div>
        </div>

        {/* Kotak Upload*/}
        <div className="min-w-0 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-300 p-4 rounded-md bg-slate-50 hover:border-[#114b79] transition-all min-w-0 overflow-hidden">
            <h4 className="font-bold text-[#114b79] text-sm mb-1 truncate">ZRW29 A001</h4>
            <p className="text-xs text-slate-500 mb-3 truncate">Upload Stok Gudang Utama</p>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFileZRW29(e.target.files?.[0] || null)} className="w-full max-w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#114b79] file:text-white hover:file:bg-[#0c3659] cursor-pointer" />
          </div>
          <div className="border border-slate-300 p-4 rounded-md bg-slate-50 hover:border-[#114b79] transition-all min-w-0 overflow-hidden">
            <h4 className="font-bold text-[#114b79] text-sm mb-1 truncate">ZRW12 A002</h4>
            <p className="text-xs text-slate-500 mb-3 truncate">Upload Stok Gudang Sewa</p>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFileZRW12(e.target.files?.[0] || null)} className="w-full max-w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#114b79] file:text-white hover:file:bg-[#0c3659] cursor-pointer" />
          </div>
          <div className="border border-slate-300 p-4 rounded-md bg-slate-50 hover:border-[#114b79] transition-all min-w-0 overflow-hidden">
            <h4 className="font-bold text-[#114b79] text-sm mb-1 truncate">Data Delivery</h4>
            <p className="text-xs text-slate-500 mb-3 truncate">Upload DO 3 Bulan Terakhir</p>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFileSales(e.target.files?.[0] || null)} className="w-full max-w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#114b79] file:text-white hover:file:bg-[#0c3659] cursor-pointer" />
          </div>
        </div>

        <div className="col-span-full pt-4 border-t border-slate-200">
          <button onClick={handleCalculate} disabled={isCalculating} className="w-full py-3.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm disabled:bg-slate-400 flex justify-center items-center gap-2">
            <Calculator size={20} />
            {isCalculating ? "Menghitung Kebutuhan..." : "Calculate"}
          </button>
        </div>
      </div>

      {/* HASIL KALKULASI */}
      {results.length > 0 && (
        <div className="w-full min-w-0 max-w-full bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4 overflow-hidden">       
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-slate-200 pb-4 gap-4 min-w-0">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-[#114b79] uppercase">Hasil Kalkulasi</h3>
              <p className="text-sm text-slate-500 font-medium truncate">Ditemukan <span className="font-bold text-slate-700">{results.length}</span> material yang perlu direplenish.</p>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button onClick={handleDownloadExcel} className="flex items-center gap-2 px-5 py-2 bg-[#3b824a] text-white font-bold rounded-md hover:bg-[#2e663a] transition-colors shadow-sm">
                <Download size={18} /> Download Excel
              </button>
              
              <button onClick={handleTransfer} disabled={isTransferring} className="flex items-center gap-2 px-5 py-2 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm disabled:bg-slate-400">
                {isTransferring ? "Memproses Data..." : "Transfer"} <ArrowRight size={18} />
              </button>
            </div>
          </div>

          {/* FITUR TAMBAH MANUAL */}
          <div className="w-full min-w-0 max-w-full bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end shadow-sm">
            <div className="md:col-span-4 min-w-0">
              <label className="block text-xs font-bold text-[#114b79] mb-1">Tambah Material Manual</label>
              <input type="text" value={manualMid} onChange={(e) => setManualMid(e.target.value.toUpperCase())} placeholder="Ketik MID (Misal: 1080888)" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-1 focus:ring-[#114b79] outline-none uppercase font-medium" />
            </div>
            
            <div className="md:col-span-3 relative min-w-0">
              <label className="block text-xs font-bold text-[#114b79] mb-1">Qty (BOX)</label>
              <input type="number" value={manualQtyBox} onChange={(e) => setManualQtyBox(e.target.value)} placeholder="0" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-1 focus:ring-[#114b79] outline-none font-medium" />
              {manualMid.trim() !== "" && Object.keys(stockA002Map).length > 0 && (
                <p className="absolute -bottom-5 left-0 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                  Max: <span className="text-amber-600">{manualMaxBox} Box</span>
                </p>
              )}
            </div>
            
            <div className="md:col-span-2 min-w-0">
              <button onClick={handleAddManual} className="w-full py-2 bg-[#114b79] text-white font-bold rounded hover:bg-[#0c3659] transition-colors flex items-center justify-center gap-2 text-sm shadow-sm h-[38px]">
                <Plus size={16} /> Tambah
              </button>
            </div>
            
            <div className="md:col-span-3 min-w-0 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-bold bg-white px-3 py-2 rounded border border-slate-200 shadow-sm h-[38px]">
              <AlertCircle size={14} className="text-[#114b79]" /> Terkunci Prioritas
            </div>
          </div>

          {/* 2. TABEL HASIL KALKULASI */}
          <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto border border-slate-300 rounded-md max-h-[500px]">
            <table className="min-w-[1000px] w-full text-sm text-left border-collapse">
              <thead className="text-xs text-white uppercase bg-[#114b79] sticky top-0 z-10 text-center shadow-sm">
                <tr>
                  <th className="px-4 py-3 border-r border-[#0c3659] whitespace-nowrap">MID</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] text-left whitespace-nowrap">Description</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] whitespace-nowrap">Available Stock</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] whitespace-nowrap">Blocked Stock</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] whitespace-nowrap">Safety Stock</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] whitespace-nowrap">X-Days</th>
                  <th className="px-4 py-3 border-r border-[#0c3659] bg-[#092942] whitespace-nowrap">Transfer Qty (Box)</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {results.map((r, index) => (
                  <tr key={r.material_id} className={`border-b border-slate-200 ${r.isManual ? 'bg-blue-50/50' : (index % 2 === 0 ? 'bg-white' : 'bg-slate-50')} hover:bg-slate-100 transition-colors`}>
                    
                    <td className="px-4 py-2 font-bold text-center border-r border-slate-100 whitespace-nowrap">{r.material_id}</td>
                    
                    <td className="px-4 py-2 border-r border-slate-100">
                      <div className="max-w-[200px] truncate" title={r.description}>
                        {r.description}
                      </div>
                    </td>
                    
                    <td className="px-4 py-2 text-center border-r border-slate-100 whitespace-nowrap">{r.available_stock}</td>
                    <td className="px-4 py-2 text-center text-red-600 font-medium border-r border-slate-100 whitespace-nowrap">{r.blocked_stock}</td>
                    <td className="px-4 py-2 text-center border-r border-slate-100 whitespace-nowrap">{r.safety_stock}</td>
                    
                    <td className="px-4 py-2 text-center font-extrabold text-slate-600 border-r border-slate-100 whitespace-nowrap">
                      {r.isManual ? "0.1" : r.x_days}
                    </td>
                    
                    <td className="px-4 py-2 text-center bg-blue-50/20 border-r border-slate-100 whitespace-nowrap">
                      <div className="flex flex-col items-center justify-center">
                        <input 
                          type="number"
                          value={r.transferred_stock_box}
                          onChange={(e) => handleEditQty(r.material_id, Number(e.target.value))}
                          className={`w-20 text-center font-black p-1 border rounded outline-none transition-all ${
                            r.isManual 
                              ? "border-blue-300 bg-white text-[#114b79] focus:ring-1 focus:ring-[#114b79]" 
                              : "border-slate-300 text-slate-800 focus:ring-1 focus:ring-[#114b79]"
                          }`}
                        />
                        <span className="text-[10px] font-bold text-slate-400 mt-1 whitespace-nowrap">
                          Max: {r.max_transfer_box}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${r.statusColor}`}>
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