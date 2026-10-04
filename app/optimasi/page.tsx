"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Truck, Plus, Play, Save, AlertCircle, X, CheckCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface MaterialItem {
  material_id: string;
  description: string;
  x_days: number;
  boxes_needed: number;
  weight_per_box: number;
  volume_per_box: number;
  pcs_per_box: number;
  pcs_per_pal: number;
}

interface Fleet {
  license_plate: string;
  shipp_type: string;
  weight_capacity: number;
  volume_capacity: number;
}

interface SelectedFleet extends Fleet {
  selectionId: string;
  ritase: number;
}

function OptimasiContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");

  const [loadingData, setLoadingData] = useState(true);
  
  const [itemsToOptimize, setItemsToOptimize] = useState<MaterialItem[]>([]);
  const [masterFleets, setMasterFleets] = useState<Fleet[]>([]);
  
  const [selectedFleets, setSelectedFleets] = useState<SelectedFleet[]>([]);
  const [fleetDropdown, setFleetDropdown] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [optResult, setOptResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (sessionId) {
      fetchInitialData();
    } else {
      fetchLatestSession();
    }
  }, [sessionId]);

  const fetchLatestSession = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from("replenishment")
        .select("id_sesi, optimized_fleet(id_optimasi)")
        .order("timestamp", { ascending: false })
        .limit(10);

      if (error) throw error;

      const pendingSession = data?.find(
        (session) => !session.optimized_fleet || session.optimized_fleet.length === 0
      );

      if (pendingSession && pendingSession.id_sesi) {
        router.replace(`/optimasi?session_id=${pendingSession.id_sesi}`);
      } else {
        setLoadingData(false);
      }
    } catch (err: any) {
      console.error("Error mencari sesi:", err.message);
      setLoadingData(false);
    }
  };

  const fetchInitialData = async () => {
    setLoadingData(true);
    try {
      const { data: fleetsData } = await supabase.from("fleet").select("*");
      if (fleetsData) setMasterFleets(fleetsData);

      const { data: detailData, error } = await supabase
        .from("detail_replenishment")
        .select(`
          material_id, 
          transferred_stock, 
          x_days,
          material (description, pcs_per_pal, pcs_per_box, gross_weight, volume)
        `)
        .eq("id_sesi", sessionId)
        .gt("transferred_stock", 0);

      if (error) throw error;

      const processedItems: MaterialItem[] = (detailData || []).map((d: any) => {
        const mat = d.material || {};
        const pcs_per_pal = mat.pcs_per_pal || 0;
        const pcs_per_box = mat.pcs_per_box || 1;
        const boxes_needed = Number(d.transferred_stock) || 0;
        const weight_per_box = pcs_per_box * (mat.gross_weight || 0);
        const volume_per_box = pcs_per_box * (mat.volume || 0);

        return {
          material_id: d.material_id,
          description: mat.description || "-",
          x_days: d.x_days,
          boxes_needed,
          pcs_per_pal,
          pcs_per_box,
          weight_per_box,
          volume_per_box
        };
      });

      setItemsToOptimize(processedItems);
    } catch (err: any) {
      alert("Gagal memuat data: " + err.message);
    }
    setLoadingData(false);
  };

  const normalizeRitase = (fleets: SelectedFleet[]) => {
    const counters: Record<string, number> = {};

    return fleets.map(fleet => {
      const count = (counters[fleet.license_plate] || 0) + 1;
      counters[fleet.license_plate] = count;

      return {
        ...fleet,
        ritase: count,
      };
    });
  };

  const handleAddFleet = () => {
    if (!fleetDropdown) return;

    const selected = masterFleets.find(
      f => f.license_plate === fleetDropdown
    );

    if (!selected) return;

    const newFleet: SelectedFleet = {
      ...selected,
      selectionId: crypto.randomUUID(),
      ritase: 1,
    };

    setSelectedFleets(prev =>
      normalizeRitase([...prev, newFleet])
    );

    setFleetDropdown("");
  };

  const handleRemoveFleet = (selectionId: string) => {
    setSelectedFleets(prev =>
      normalizeRitase(
        prev.filter(f => f.selectionId !== selectionId)
      )
    );
  };



  const handleOptimize = async () => {
    if (selectedFleets.length === 0) return alert("Pilih minimal 1 armada!");
    if (itemsToOptimize.length === 0) return alert("Tidak ada barang yang perlu diangkut.");

    setIsOptimizing(true);
    setOptResult(null);
    setActiveTab(0);

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: itemsToOptimize,
          fleets: selectedFleets
        })
      });

      if (!response.ok) throw new Error("API Python gagal merespon.");
      const resultData = await response.json();
      setOptResult(resultData);
    } catch (err: any) {
      alert("Error Optimasi: " + err.message);
    }
    setIsOptimizing(false);
  };

const handleSaveTransfer = async () => {
    if (!optResult || !sessionId) return;
    setIsSaving(true);
    
    try {
      for (const fleetResult of optResult.optimized_fleets) {
        const { data: headerData, error: headerErr } = await supabase
          .from("optimized_fleet")
          .insert([{
            id_sesi: sessionId,
            license_plate: fleetResult.license_plate,
            ritase: fleetResult.ritase,
            total_weight: fleetResult.total_weight,
            total_volume: fleetResult.total_volume,
            status: "Menunggu Picking"
          }])
          .select("id_optimasi")
          .single();

        if (headerErr) throw headerErr;
        const newIdOptimasi = headerData.id_optimasi;

        const detailPayload = fleetResult.items.map((item: any) => ({
          id_optimasi: newIdOptimasi,        
          material_id: item.material_id,
          qty_transferred: item.qty_loaded_boxes 
        }));

        const { error: detailErr } = await supabase.from("detail_optimasi").insert(detailPayload);
        if (detailErr) throw detailErr;
      }

      const summaryMap = new Map();
      optResult.optimized_fleets.forEach((fleet: any) => {
        fleet.items.forEach((item: any) => {
          if (summaryMap.has(item.material_id)) {
            const existing = summaryMap.get(item.material_id);
            existing.qty += item.qty_loaded_boxes;
          } else {
            summaryMap.set(item.material_id, {
              material_id: item.material_id,
              description: item.description,
              qty: item.qty_loaded_boxes
            });
          }
        });
      });

      const excelData = Array.from(summaryMap.values()).map(item => ({
        "Material ID": item.material_id,
        "Deskripsi": item.description,
        "Qty (Box)": item.qty
      }));

      if (excelData.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        worksheet["!cols"] = [
          { wch: 15 }, 
          { wch: 40 }, 
          { wch: 25 }  
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Transfer");
        
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Bulan dimulai dari 0
        const yyyy = today.getFullYear();
        const formattedDate = `${dd}${mm}${yyyy}`;
        
        XLSX.writeFile(workbook, `Replenishment_${formattedDate}.xlsx`);
      }
      
      setIsSaving(false); 
      alert("Data berhasil dikirim ke Checker Gudang Sewa!");
      
      setTimeout(() => {
        router.push("/"); 
      }, 500);

    } catch (err: any) {
      alert("Gagal menyimpan ke database: " + err.message);
      setIsSaving(false);
    }
  };

  if (loadingData) {
    return <div className="p-10 text-center font-bold text-[#114b79]">Memuat Data...</div>;
  }

  if (!sessionId || itemsToOptimize.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-slate-200 p-10 text-center space-y-4 max-w-2xl mx-auto mt-10">
        <AlertCircle size={48} className="mx-auto text-red-500 mb-2" />
        <h2 className="text-2xl font-extrabold text-slate-800">Sesi Belum Tersedia</h2>
        <p className="text-slate-600 font-medium">Anda belum melakukan kalkulasi replenishment yang baru, atau semua kalkulasi sebelumnya sudah berhasil diproses ke armada.</p>
        <button 
          onClick={() => router.push('/replenishment')} 
          className="mt-4 px-6 py-3 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm inline-block"
        >
          Create Replenishment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#114b79] uppercase tracking-wide flex items-center gap-2">
            Fleet Optimization
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Sesi ID: <span className="font-bold">{sessionId}</span> | Total Item: <span className="font-bold">{itemsToOptimize.length}</span> MID</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
        <h3 className="text-md font-extrabold text-slate-700 mb-4 uppercase">1. Pilih Armada Tersedia</h3>
        
        <div className="flex flex-col md:flex-row gap-3 items-end mb-6">
          <div className="w-full md:w-96">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Pilih Plat Nomor</label>
            <select 
              value={fleetDropdown} 
              onChange={(e) => setFleetDropdown(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-2.5 outline-none focus:ring-1 focus:ring-[#114b79] font-medium"
            >
              <option value="">-- Pilih Armada --</option>
              {masterFleets.map(f => (
                <option key={f.license_plate} value={f.license_plate}>
                  {f.license_plate} - {f.shipp_type}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleAddFleet} className="px-5 py-2.5 bg-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-300 transition-colors flex items-center gap-2">
            <Plus size={18} /> Tambah
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedFleets.map((fleet, index) => (
            <div
              key={fleet.selectionId}
              className="border border-[#114b79] bg-blue-50 rounded-md p-4 relative"
            >
              <button
                onClick={() => handleRemoveFleet(fleet.selectionId)}
                className="absolute top-3 right-3 text-red-500 hover:text-red-700">
                <X size={18} />
              </button>
              <div className="font-extrabold text-[#114b79] text-lg">Fleet {index + 1}: {fleet.license_plate}</div>
              <div className="text-sm text-slate-600 font-medium mb-2">{fleet.shipp_type} • Ritase {fleet.ritase}</div>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="bg-white p-2 rounded border border-slate-200">Max Vol: {fleet.volume_capacity} dm³</div>
                <div className="bg-white p-2 rounded border border-slate-200">Max Berat: {fleet.weight_capacity} kg</div>
              </div>
            </div>
          ))}
          {selectedFleets.length === 0 && (
            <div className="col-span-full p-4 border border-dashed border-slate-300 rounded-md text-center text-slate-500 font-medium">
              Belum ada armada yang dipilih.
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
          <button 
            onClick={handleOptimize} 
            disabled={isOptimizing || selectedFleets.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-[#3b824a] text-white font-extrabold rounded-md hover:bg-[#2e663a] transition-colors shadow-sm disabled:bg-slate-400"
          >
            {isOptimizing ? "Optimizing..." : <><Play size={18} /> Optimize </>}
          </button>
        </div>
      </div>

      {optResult && (
        <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-md font-extrabold text-slate-700 uppercase">2. Hasil Alokasi Muatan</h3>
            <button 
              onClick={handleSaveTransfer} 
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] shadow-sm disabled:bg-slate-400"
            >
              <Save size={18} /> {isSaving ? "Menyimpan..." : "Transfer Stok"}
            </button>
          </div>

          <div className="flex gap-2 border-b border-slate-300 mb-4 overflow-x-auto">
            {optResult.optimized_fleets.map((fleet: any, idx: number) => (
              <button
                key={`${fleet.license_plate}-${fleet.ritase}-${idx}`}
                onClick={() => setActiveTab(idx)}
                className={`px-4 py-2 font-bold whitespace-nowrap transition-colors ${
                  activeTab === idx
                    ? 'border-b-2 border-[#114b79] text-[#114b79]'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Fleet {idx + 1}: {fleet.license_plate} - Ritase {fleet.ritase}
              </button>
            ))}
            <button
              onClick={() => setActiveTab(optResult.optimized_fleets.length)}
              className={`px-4 py-2 font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === optResult.optimized_fleets.length ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <AlertCircle size={16} /> Sisa Tidak Terangkut
            </button>
          </div>

          {activeTab < optResult.optimized_fleets.length && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-center">
                  <div className="text-xs text-slate-500 font-bold mb-1">Tipe Armada</div>
                  <div className="font-extrabold text-[#114b79]">{optResult.optimized_fleets[activeTab].shipp_type}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-center">
                  <div className="text-xs text-slate-500 font-bold mb-1">Utilitas Berat</div>
                  <div className="font-extrabold text-[#3b824a]">{optResult.optimized_fleets[activeTab].utilization_weight_pct}%</div>
                  <div className="text-xs text-slate-400 mt-0.5">{optResult.optimized_fleets[activeTab].total_weight} / {optResult.optimized_fleets[activeTab].weight_capacity} kg</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-center">
                  <div className="text-xs text-slate-500 font-bold mb-1">Utilitas Volume</div>
                  <div className="font-extrabold text-[#3b824a]">{optResult.optimized_fleets[activeTab].utilization_volume_pct}%</div>
                  <div className="text-xs text-slate-400 mt-0.5">{optResult.optimized_fleets[activeTab].total_volume} / {optResult.optimized_fleets[activeTab].volume_capacity} dm³</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-center flex flex-col justify-center items-center">
                  <div className="text-xs text-slate-500 font-bold mb-1">Status</div>
                  <CheckCircle size={20} className="text-[#3b824a]" />
                </div>
              </div>

              <div className="border border-slate-300 rounded-md overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-white uppercase bg-[#114b79] sticky top-0">
                    <tr>
                      <th className="px-4 py-3 border-r border-[#0c3659] text-center">MID</th>
                      <th className="px-4 py-3 border-r border-[#0c3659] text-center">Description</th>
                      <th className="px-4 py-3 border-r border-[#0c3659] text-center">Qty (Box)</th>
                      <th className="px-4 py-3 border-r border-[#0c3659] text-center">Subtotal Berat (kg)</th>
                      <th className="px-4 py-3 text-center">Subtotal Vol (m³)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optResult.optimized_fleets[activeTab].items.map((item: any, i: number) => (
                      <tr key={item.material_id} className={`border-b border-slate-200 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="px-4 py-2 font-bold">{item.material_id}</td>
                        <td className="px-4 py-2">{item.description}</td>
                        <td className="px-4 py-2 text-center font-bold text-[#114b79]">{item.qty_loaded_boxes}</td>
                        <td className="px-4 py-2 text-center">{item.weight_subtotal}</td>
                        <td className="px-4 py-2 text-center">{item.volume_subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === optResult.optimized_fleets.length && (
            <div>
              <div className="bg-red-50 p-4 border border-red-200 rounded-md mb-4 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-red-700">Barang Gagal Muat</h4>
                  <p className="text-xs text-red-600 mt-1">Barang ini tidak dapat dimuat di armada terpilih. Pertimbangkan menambah armada baru.</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">Total Kekurangan Berat: <span className="text-red-600">{optResult.unassigned.total_weight} kg</span></div>
                  <div className="text-sm font-bold text-slate-700">Total Kekurangan Vol: <span className="text-red-600">{optResult.unassigned.total_volume} m³</span></div>
                </div>
              </div>
              
              <div className="border border-slate-300 rounded-md overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 border-r border-slate-300">MID</th>
                      <th className="px-4 py-3 border-r border-slate-300">Description</th>
                      <th className="px-4 py-3 border-r border-slate-300 text-center">Sisa Qty (Box)</th>
                      <th className="px-4 py-3 border-r border-slate-300 text-center">Sisa Berat (kg)</th>
                      <th className="px-4 py-3 text-center">Sisa Vol (m³)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optResult.unassigned.items.map((item: any, i: number) => (
                      <tr key={item.material_id} className={`border-b border-slate-200 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="px-4 py-2 font-bold">{item.material_id}</td>
                        <td className="px-4 py-2">{item.description}</td>
                        <td className="px-4 py-2 text-center font-bold text-red-600">{item.boxes_left}</td>
                        <td className="px-4 py-2 text-center">{item.weight_left}</td>
                        <td className="px-4 py-2 text-center">{item.volume_left}</td>
                      </tr>
                    ))}
                    {optResult.unassigned.items.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-500 font-bold">Semua barang berhasil termuat!</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}

export default function OptimasiPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-[#114b79]">Loading...</div>}>
      <OptimasiContent />
    </Suspense>
  );
}