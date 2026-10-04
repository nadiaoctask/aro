"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("inventory_controller");
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) return alert("Gagal Register: " + authErr.message);

    if (authData.user) {
      const { error: profileErr } = await supabase.from("profiles").insert([
        { id: authData.user.id, name: name, role: role }
      ]);
      if (profileErr) return alert("Gagal simpan profil: " + profileErr.message);
      
      alert("Registrasi sukses! Silakan login.");
      router.push("/login");
    }
  };

  return (
      <form onSubmit={handleRegister} className="bg-white p-8 rounded-lg shadow-md w-96 flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-[#114b79] mb-4">Buat Akun</h2>
        <input type="text" placeholder="Nama Lengkap" required className="border p-2 rounded" value={name} onChange={e => setName(e.target.value)} />
        <input type="email" placeholder="Email" required className="border p-2 rounded" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password (min 6 char)" required className="border p-2 rounded" value={password} onChange={e => setPassword(e.target.value)} />
        <select className="border p-2 rounded bg-white" value={role} onChange={e => setRole(e.target.value)}>
          <option value="inventory_controller">Inventory Controller</option>
          <option value="checker">Checker</option>
        </select>
        <button type="submit" className="bg-[#114b79] text-white p-2 rounded font-bold mt-2 hover:bg-[#0c3659]">Daftar</button>
      </form>
  );
}