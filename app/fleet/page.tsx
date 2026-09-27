"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, FileSpreadsheet, Edit, Trash2, X, Save, Search, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import * as XLSX from "xlsx";

interface Fleet {
  license_plate: string;
  shipp_type: string;
  vendor: string;
  driver: string;
  volume_capacity: number;
  weight_capacity: number;
}

export default function FleetPage() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "formAdd" | "modalEdit">("table");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 100;
  
  const [formData, setFormData] = useState<Fleet>({
    license_plate: "", shipp_type: "", vendor: "", driver: "", volume_capacity: 0, weight_capacity: 0,
  });

  useEffect(() => {
    fetchFleets();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const fetchFleets = async () => {
    setLoading(true);
    let allData: Fleet[] = [];
    let hasMore = true;
    let page = 0;
    const limit = 1000;

    while (hasMore) {
      const { data, error } = await supabase
        .from("fleet")
        .select("*")
        .order("license_plate", { ascending: true })
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
    setFleets(allData);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("fleet").upsert([formData]);
    if (error) {
      alert("Gagal menyimpan data: " + error.message);
    } else {
      alert("Data berhasil disimpan!");
      setView("table");
      fetchFleets();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Yakin ingin menghapus armada dengan Plat Nomor ${id}?`)) return;
    const { error } = await supabase.from("fleet").delete().eq("license_plate", id);
    if (error) alert("Gagal menghapus: " + error.message);
    else fetchFleets();
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
        
        // Ambil data mentah
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        const formattedData = jsonData.map((rawRow) => {
          // 1. Trik Ampuh: Bersihkan semua spasi tersembunyi di NAMA KOLOM (Header)
          const row: any = {};
          Object.keys(rawRow).forEach((key) => {
            const cleanKey = key.trim(); 
            row[cleanKey] = rawRow[key];
          });

          // 2. Mapping data dengan nama kolom yang sudah bersih
          return {
            license_plate: String(row["Lisence Plate"] || row["License Plate"] || "")
              .toUpperCase()
              .trim()
              .replace(/\s+/g, ' '),
            shipp_type: String(row["Shipp. Type"] || row["Shipp. Typ"] || "-"),
            // Ambil "Name" pertama (Fwd Agent) atau "Name_1" (Fwd Agent Cust) jika yang pertama kosong
            vendor: String(row["Name"] || row["Name_1"] || "-"), 
            driver: String(row["Dvr. Namer"] || row["Dvr. Name"] || "-"),
            volume_capacity: Number(row["Load Volume"] || 0),
            weight_capacity: Number(row["Max.Load Weight"] || 0),
          };
        }).filter(item => item.license_plate !== "");

        if (formattedData.length === 0) {
          setLoading(false);
          return alert("Data kosong! Pastikan baris Header (Lisence Plate, dll) berada persis di BARIS 1 pada file Excel.");
        }

        const chunkSize = 1000;
        for (let i = 0; i < formattedData.length; i += chunkSize) {
          const chunk = formattedData.slice(i, i + chunkSize);
          const { error } = await supabase.from("fleet").upsert(chunk);
          if (error) throw error;
        }

        alert(`${formattedData.length} data armada berhasil diupload!`);
        fetchFleets();
      } catch (error: any) {
        alert("Terjadi kesalahan saat upload: " + error.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredData = fleets.filter((f) =>
    f.license_plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.driver.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
      
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h2 className="text-xl font-extrabold text-[#114b79] uppercase tracking-wide flex items-center gap-2">
          Data Fleet
        </h2>
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
                placeholder="Cari Plat Nomor / Vendor / Driver..."
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
                  setFormData({ license_plate: "", shipp_type: "", vendor: "", driver: "", volume_capacity: 0, weight_capacity: 0 });
                  setView("formAdd");
                }}
                disabled={loading}
                className="flex flex-1 md:flex-none justify-center items-center gap-2 px-5 py-2.5 bg-[#114b79] text-white font-bold rounded-md hover:bg-[#0c3659] transition-colors shadow-sm whitespace-nowrap disabled:bg-slate-400"
              >
                <Plus size={18} />
                <span>Tambah Armada</span>
              </button>
            </div>
          </div>

          <div className="border border-slate-300 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="text-xs text-white uppercase bg-[#114b79] text-center">
                  <tr>
                    <th className="px-5 py-4 border-r border-[#0c3659] w-16">No</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Plat Nomor</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Tipe Kendaraan</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Vendor</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Driver</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Max Vol (dm³)</th>
                    <th className="px-5 py-4 border-r border-[#0c3659]">Max Berat (kg)</th>
                    <th className="px-5 py-4 w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {loading ? (
                    <tr><td colSpan={8} className="text-center py-8 font-semibold">Memuat data / Proses Upload...</td></tr>
                  ) : currentRows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-500 font-semibold">Data tidak ditemukan.</td></tr>
                  ) : (
                    currentRows.map((f, index) => (
                      <tr key={f.license_plate} className={`border-b border-slate-200 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}>
                        <td className="px-5 py-2 text-center font-medium">{indexOfFirstRow + index + 1}</td>
                        <td className="px-5 py-2 text-center font-bold text-[#114b79]">{f.license_plate}</td>
                        <td className="px-5 py-2 text-center">{f.shipp_type}</td>
                        <td className="px-5 py-2">{f.vendor}</td>
                        <td className="px-5 py-2">{f.driver}</td>
                        <td className="px-5 py-2 text-center">{f.volume_capacity}</td>
                        <td className="px-5 py-2 text-center">{f.weight_capacity}</td>
                        <td className="px-5 py-2 flex justify-center gap-3">
                          <button onClick={() => { setFormData(f); setView("modalEdit"); }} className="text-[#114b79] hover:text-blue-800 font-bold" title="Edit">
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleDelete(f.license_plate)} className="text-red-600 hover:text-red-800 font-bold" title="Hapus">
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
        <form onSubmit={handleSave} className="max-w-3xl mx-auto border border-slate-300 p-6 rounded-md bg-slate-50 shadow-sm">
          <h3 className="text-lg font-extrabold text-[#114b79] mb-5 uppercase tracking-wide flex items-center gap-2">
            <Truck size={20} /> Form Tambah Armada
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Plat Nomor (Kunci Utama)</label>
              <input required type="text" value={formData.license_plate} onChange={(e) => setFormData({...formData, license_plate: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium uppercase" placeholder="Misal: B 1234 CD" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Tipe Pengiriman</label>
              <input required type="text" value={formData.shipp_type} onChange={(e) => setFormData({...formData, shipp_type: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" placeholder="Misal: 4D, WR" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Vendor</label>
              <input required type="text" value={formData.vendor} onChange={(e) => setFormData({...formData, vendor: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Nama Driver</label>
              <input required type="text" value={formData.driver} onChange={(e) => setFormData({...formData, driver: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Kapasitas Volume Maksimal</label>
              <input required type="number" step="0.01" value={formData.volume_capacity} onChange={(e) => setFormData({...formData, volume_capacity: Number(e.target.value)})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Kapasitas Berat Maksimal</label>
              <input required type="number" step="0.01" value={formData.weight_capacity} onChange={(e) => setFormData({...formData, weight_capacity: Number(e.target.value)})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
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
          <form onSubmit={handleSave} className="w-full max-w-3xl bg-white rounded-md shadow-2xl overflow-hidden border border-slate-300">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-[#f0f2f5]">
              <h3 className="text-lg font-extrabold text-[#114b79] uppercase tracking-wide">Edit Data Armada</h3>
              <button type="button" onClick={() => setView("table")} className="text-slate-500 hover:text-red-600"><X size={24} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Plat Nomor (Kunci Utama)</label>
                <input readOnly type="text" value={formData.license_plate} className="w-full border border-slate-300 bg-slate-100 text-slate-500 font-bold rounded-md p-2.5 cursor-not-allowed outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Tipe Pengiriman</label>
                <input required type="text" value={formData.shipp_type} onChange={(e) => setFormData({...formData, shipp_type: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Vendor</label>
                <input required type="text" value={formData.vendor} onChange={(e) => setFormData({...formData, vendor: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Nama Driver</label>
                <input required type="text" value={formData.driver} onChange={(e) => setFormData({...formData, driver: e.target.value})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Kapasitas Volume Maksimal</label>
                <input required type="number" step="0.01" value={formData.volume_capacity} onChange={(e) => setFormData({...formData, volume_capacity: Number(e.target.value)})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Kapasitas Berat Maksimal</label>
                <input required type="number" step="0.01" value={formData.weight_capacity} onChange={(e) => setFormData({...formData, weight_capacity: Number(e.target.value)})} className="w-full border border-slate-300 rounded-md p-2.5 focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] outline-none bg-white font-medium" />
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