"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, FileSpreadsheet, Edit, Trash2, X, Save, Search, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";

interface SafetyStock {
  id_ss?: string; 
  material_id: string;
  safety_stock: number;
  material?: {
    description: string;
  };
}

export default function SafetyStockPage() {
  const [safetyStocks, setSafetyStocks] = useState<SafetyStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "formAdd" | "modalEdit">("table");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 100;
  
  const [formData, setFormData] = useState<SafetyStock>({
    material_id: "", safety_stock: 0,
  });

  useEffect(() => {
    fetchSafetyStocks();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const fetchSafetyStocks = async () => {
    setLoading(true);
    let allData: SafetyStock[] = [];
    let hasMore = true;
    let page = 0;
    const limit = 1000;

    while (hasMore) {
      const { data, error } = await supabase
        .from("safety_stock")
        .select("id_ss, material_id, safety_stock, material(description)")
        .order("material_id", { ascending: true })
        .range(page * limit, (page + 1) * limit - 1);

      if (error) {
        alert("Gagal mengambil data: " + error.message);
        hasMore = false;
        break;
      }

      if (data) {
        allData = [...allData, ...data];
        if (data.length < limit) hasMore = false;
        else page++;
      }
    }
    setSafetyStocks(allData);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (view === "formAdd") {
      const { data: exist } = await supabase.from("safety_stock").select("id_ss").eq("material_id", formData.material_id).single();
      if (exist) {
        alert(`Material ID ${formData.material_id} sudah memiliki Safety Stock. Silakan gunakan fitur Edit.`);
        return;
      }
    }

    // Memastikan angka selalu di-roundup sebelum disave dari form input manual
    const payload = {
      ...(formData.id_ss ? { id_ss: formData.id_ss } : {}),
      material_id: formData.material_id,
      safety_stock: Math.ceil(formData.safety_stock) 
    };

    const { error } = await supabase.from("safety_stock").upsert([payload]);
    
    if (error) {
      alert("Gagal menyimpan data: " + error.message);
    } else {
      alert("Data berhasil disimpan!");
      setView("table");
      fetchSafetyStocks();
    }
  };

  const handleDelete = async (id_ss: string, material_id: string) => {
    if (!confirm(`Yakin ingin menghapus safety stock untuk material ${material_id}?`)) return;
    const { error } = await supabase.from("safety_stock").delete().eq("id_ss", id_ss);
    if (error) alert("Gagal menghapus: " + error.message);
    else fetchSafetyStocks();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        const existingMap = new Map(safetyStocks.map(item => [item.material_id, item.id_ss]));

        const formattedData = jsonData.map((row) => {
          const mid = String(row["MID"] || row["material_id"] || "");
          return {
            ...(existingMap.has(mid) ? { id_ss: existingMap.get(mid) } : {}),
            material_id: mid,
            // Membulatkan (round up) data dari file excel ke atas secara otomatis
            safety_stock: Math.ceil(Number(row["Safety Stock (SU)"] || row["safety_stock"] || 0)),
          };
        }).filter(item => item.material_id !== "");

        if (formattedData.length === 0) {
          setLoading(false);
          return alert("Data Excel kosong atau format kolom tidak sesuai.");
        }

        const chunkSize = 1000;
        for (let i = 0; i < formattedData.length; i += chunkSize) {
          const chunk = formattedData.slice(i, i + chunkSize);
          const { error } = await supabase.from("safety_stock").upsert(chunk);
          if (error) throw error;
        }

        alert(`${formattedData.length} data berhasil diupload!`);
        fetchSafetyStocks();
      } catch (error: any) {
        alert("Terjadi kesalahan saat upload: " + error.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredData = safetyStocks.filter((s) =>
    s.material_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.material?.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
      
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h2 className="text-xl font-extrabold text-[#114b79] uppercase tracking-wide">Data Safety Stock</h2>
        <p className="text-sm text-slate-500 font-medium mt-1"></p>
      </div>

      {view === "table" && (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search size={18} className="text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Cari MID / Deskripsi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border border-slate-300 text-slate-700 text-sm rounded-md focus:ring-1 focus:ring-[#114b79] focus:border-[#114b79] block w-full pl-10 p-2.5 outline-none font-medium shadow-sm transition-all"
              />
            </div>

            <div className="flex gap-3 w-full md:w-auto">
              <label className={`flex flex-1 md:flex-none justify-center items-center gap-2 px-5 py-2.5 text-white font-bold rounded-md cursor-pointer transition-colors shadow-sm whitespace-nowrap ${loading ? 'bg-slate-400' : 'bg-[#3b824a] hover:bg-[#2e663a]'}`}>
                <FileSpreadsheet size={18} />
                <span>{loading ? 'Memproses...' : 'Upload XLSX'}</span>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" disabled={loading} />
              </label>
              
              <button 
                onClick={() => {
                  setFormData({ material_id: "", safety_stock: 0 });
                  setView("formAdd");
                }}
                disabled={loading}
                className="flex flex-1 md:flex-none justify-center items-center gap-2 px-5 py-2.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm whitespace-nowrap disabled:bg-slate-400"
              >
                <Plus size={18} />
                <span>Tambah Data</span>
              </button>
            </div>
          </div>

          <div className="border border-slate-300 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="text-xs text-white uppercase bg-[#114b79] text-center">
                  <tr>
                    <th className="px-5 py-4 border-r border-[#0c3659] w-16">No</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Material ID</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Description</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Safety Stock (Box)</th>
                    <th className="px-5 py-4 w-32">Aksi</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-8 font-semibold">Memuat data / Proses Upload...</td></tr>
                  ) : currentRows.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-500 font-semibold">Data tidak ditemukan.</td></tr>
                  ) : (
                    currentRows.map((s, index) => (
                      <tr key={s.id_ss || index} className={`border-b border-slate-200 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}>
                        <td className="px-5 py-2 text-center font-medium">{indexOfFirstRow + index + 1}</td>
                        <td className="px-5 py-2 text-center font-bold">{s.material_id}</td>
                        <td className="px-5 py-2 whitespace-nowrap">{s.material?.description || "-"}</td>
                        <td className="px-5 py-2 text-center text-[#114b79] font-bold">{s.safety_stock}</td>
                        <td className="px-5 py-2 flex justify-center gap-3">
                          <button onClick={() => { setFormData({ id_ss: s.id_ss, material_id: s.material_id, safety_stock: s.safety_stock }); setView("modalEdit"); }} className="text-[#114b79] hover:text-blue-800 font-bold" title="Edit">
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleDelete(s.id_ss!, s.material_id)} className="text-red-600 hover:text-red-800 font-bold" title="Hapus">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loading && filteredData.length > 0 && (
              <div className="flex flex-col md:flex-row justify-between items-center px-5 py-3 bg-slate-50 border-t border-slate-300 gap-3">
                <span className="text-sm text-slate-600 font-medium">
                  Menampilkan <span className="font-bold text-[#114b79]">{indexOfFirstRow + 1}</span> - <span className="font-bold text-[#114b79]">{Math.min(indexOfLastRow, filteredData.length)}</span> dari <span className="font-bold text-[#114b79]">{filteredData.length}</span> data
                </span>
                
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={20} /></button>
                  <span className="text-sm font-bold text-slate-700 px-3">Halaman {currentPage} dari {totalPages}</span>
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight size={20} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {view === "formAdd" && (
        <form onSubmit={handleSave} className="max-w-2xl mx-auto border border-slate-300 p-6 rounded-md bg-slate-50 shadow-sm">
          <h3 className="text-lg font-extrabold text-[#114b79] mb-5 uppercase tracking-wide">Form Tambah Safety Stock</h3>
          <div className="flex flex-col gap-5 mb-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Material ID (MID)</label>
              <input required type="text" value={formData.material_id} onChange={(e) => setFormData({...formData, material_id: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
              <p className="text-xs text-slate-500 mt-1">Pastikan MID ini sudah terdaftar di Data Material.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Safety Stock (Box)</label>
              <input required type="number" step="1" value={formData.safety_stock} onChange={(e) => setFormData({...formData, safety_stock: Number(e.target.value)})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => setView("table")} className="px-5 py-2.5 bg-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-300 transition-colors">Batal</button>
            <button type="submit" className="flex items-center gap-2 px-5 py-2.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm">
              <Save size={18} /> Simpan Data
            </button>
          </div>
        </form>
      )}

      {view === "modalEdit" && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="w-full max-w-2xl bg-white rounded-md shadow-2xl overflow-hidden border border-slate-300">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-[#f0f2f5]">
              <h3 className="text-lg font-extrabold text-[#114b79] uppercase tracking-wide">Edit Safety Stock</h3>
              <button type="button" onClick={() => setView("table")} className="text-slate-500 hover:text-red-600"><X size={24} /></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Material ID (Tidak bisa diubah)</label>
                <input readOnly type="text" value={formData.material_id} className="w-full border border-slate-300 bg-slate-100 text-slate-500 font-bold rounded-md p-2.5 cursor-not-allowed outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Safety Stock (Box)</label>
                <input required type="number" step="1" value={formData.safety_stock} onChange={(e) => setFormData({...formData, safety_stock: Number(e.target.value)})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-[#f0f2f5]">
              <button type="button" onClick={() => setView("table")} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-md hover:bg-slate-100 transition-colors">Batal</button>
              <button type="submit" className="flex items-center gap-2 px-5 py-2.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm">
                <Save size={18} /> Update Data
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}