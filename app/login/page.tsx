"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import Image from "next/image"; // Opsional jika ingin pakai fitur Image bawaan Next.js

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      alert("Gagal Login: " + error.message);
    } else {
      router.push("/"); 
      router.refresh(); 
    }
  };

  return (
    <div className="bg-white p-10 rounded-2xl shadow-2xl w-[400px] flex flex-col items-center">
      
      {/* Bagian Logo (Pastikan kamu punya file logo di folder public, misal public/wings.png) */}
      <div className="mb-4 h-12 w-auto">
        <img 
          src="public/logo Wings.svg" 
          alt="Wings Logo" 
          className="h-full w-full object-contain"
          // Jika gambar tidak ada, ganti dengan teks atau hapus tag img ini
        />
      </div>

      <h2 className="text-2xl font-extrabold text-[#112340] tracking-wide mb-1">LOGIN</h2>
      <p className="text-sm font-bold text-slate-500 mb-8 text-center">Automated Replenishment Optimization</p>

      <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
        
        {/* Input Email/Username */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-extrabold text-[#112340]">Email</label>
          <input 
            type="email" 
            required 
            className="bg-slate-50 border border-slate-200 p-3 rounded-lg outline-none focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] text-sm" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
          />
        </div>

        {/* Input Password */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-extrabold text-[#112340]">Password</label>
          <input 
            type="password" 
            required 
            className="bg-slate-50 border border-slate-200 p-3 rounded-lg outline-none focus:border-[#114b79] focus:ring-1 focus:ring-[#114b79] text-sm" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
          />
        </div>

        {/* Tombol Masuk */}
        <button type="submit" className="bg-[#114b79] text-white p-3 rounded-xl font-bold mt-2 hover:bg-[#0c3659] transition-colors w-full shadow-sm">
          Masuk
        </button>
      </form>

      {/* Tautan ke Register */}
      <p className="mt-8 text-sm text-slate-500 font-medium">
        Belum punya akun? <Link href="/register" className="font-bold text-[#114b79] hover:underline">Daftar</Link>
      </p>
      
    </div>
  );
}