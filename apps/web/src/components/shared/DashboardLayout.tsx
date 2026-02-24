'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="relative flex min-h-screen bg-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-20 top-10 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>
      <Sidebar />
      <main className="relative z-10 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
