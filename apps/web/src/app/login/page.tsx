'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';
import { useCompany } from '@/lib/company';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { appName, logoUrl } = useCompany();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login berhasil!');
      router.push('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-100 via-white to-violet-100 px-4 py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-200 bg-white/70 shadow-2xl shadow-sky-200/60 backdrop-blur md:grid-cols-2">
          <div className="hidden flex-col justify-between border-r border-slate-200 bg-gradient-to-br from-blue-600/30 via-cyan-500/20 to-violet-600/20 p-10 md:flex">
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-blue-100">
                {logoUrl ? (
                  <img src={logoUrl} alt={appName} className="h-full w-full object-cover" />
                ) : (
                  <svg className="h-8 w-8 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle cx="12" cy="12" r="9" strokeWidth="2" />
                    <circle cx="12" cy="12" r="3" strokeWidth="2" />
                  </svg>
                )}
              </div>
              <h1 className="text-3xl font-bold text-slate-800">{appName}</h1>
              <p className="mt-3 text-sm text-slate-600">
                Kelola billing meja, transaksi F&B, dan operasional harian dalam satu dashboard modern.
              </p>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <Feature text="Monitoring status meja real-time" />
              <Feature text="Kontrol billing fleksibel untuk setiap sesi" />
              <Feature text="Laporan dan audit siap untuk bisnis" />
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-8 text-center md:text-left">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-600">Secure Access</p>
              <h2 className="text-3xl font-bold text-slate-800">Masuk ke akun Anda</h2>
              <p className="mt-2 text-sm text-slate-500">Gunakan akun resmi yang tersedia dari seed data sistem.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="email@contoh.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
                {loading ? 'Memproses...' : 'Masuk ke Dashboard'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-cyan-500" />
      <p>{text}</p>
    </div>
  );
}
