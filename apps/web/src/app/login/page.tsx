'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

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

  const fillDemo = (role: string) => {
    const creds: Record<string, { email: string; password: string }> = {
      owner: { email: 'owner@billiard.com', password: 'owner123' },
      manager: { email: 'manager@billiard.com', password: 'manager123' },
      cashier: { email: 'cashier@billiard.com', password: 'cashier123' },
    };
    setEmail(creds[role].email);
    setPassword(creds[role].password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" strokeWidth="2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Billiard POS</h1>
          <p className="text-slate-400 mt-1">Masuk ke sistem manajemen</p>
        </div>

        <div className="card">
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
            <button
              type="submit"
              className="btn-primary w-full py-3 text-base"
              disabled={loading}
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          {/* Demo shortcuts */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center mb-3">Demo Login</p>
            <div className="flex gap-2">
              {['owner', 'manager', 'cashier'].map((role) => (
                <button
                  key={role}
                  onClick={() => fillDemo(role)}
                  className="flex-1 py-1.5 text-xs capitalize rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
