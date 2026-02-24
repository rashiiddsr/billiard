'use client';

import { useCallback, useEffect, useState } from 'react';
import { billingApi, paymentsApi, stockApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function CashierDashboard() {
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [sessions, payments, stock] = await Promise.all([
        billingApi.getActiveSessions(),
        paymentsApi.list({ status: 'PENDING' }).catch(() => []),
        stockApi.getLowStockAlerts().catch(() => []),
      ]);
      setActiveSessions(sessions);
      setPendingPayments(payments.slice(0, 5));
      setLowStock(stock);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clockInterval); };
  }, [fetchData]);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Kasir</h1>
          <p className="text-slate-500">{now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="rounded-2xl bg-blue-600 px-4 py-2 font-mono text-2xl font-bold text-white shadow-lg">
          {now.toLocaleTimeString('id-ID')}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Meja Aktif" value={`${activeSessions.length}`} color="from-emerald-500 to-green-400" />
        <InfoCard title="Menunggu Bayar" value={`${pendingPayments.length}`} color="from-amber-500 to-yellow-400" />
        <InfoCard title="Stok Menipis" value={`${lowStock.length}`} color="from-rose-500 to-pink-400" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickLink href="/cashier/billing" emoji="🎱" label="Mulai Billing" sub="Kelola sesi meja" />
        <QuickLink href="/cashier/orders" emoji="🍔" label="Pesanan F&B" sub="Tambah menu" />
        <QuickLink href="/cashier/checkout" emoji="💳" label="Checkout" sub="Proses pembayaran" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Sesi Aktif</h2>
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div>
                  <p className="font-medium">{s.table?.name}</p>
                  <p className="text-xs text-slate-500">Mulai: {new Date(s.startTime).toLocaleTimeString('id-ID')}</p>
                </div>
                <p className="font-semibold text-emerald-600">{formatCurrency(s.totalAmount)}</p>
              </div>
            ))}
            {activeSessions.length === 0 && <p className="text-sm text-slate-500">Tidak ada sesi aktif</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 text-lg font-semibold text-amber-600">Notifikasi Kasir</h2>
          <div className="space-y-2 text-sm">
            {pendingPayments.map((p) => (
              <Link key={p.id} href={`/cashier/checkout?paymentId=${p.id}`} className="block rounded-xl bg-amber-50 p-2 hover:bg-amber-100">
                <p className="font-medium">{p.paymentNumber}</p>
                <p className="text-xs text-slate-500">{formatCurrency(p.totalAmount)} • {p.method}</p>
              </Link>
            ))}
            {pendingPayments.length === 0 && <p className="text-slate-500">Tidak ada pembayaran pending.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, emoji, label, sub }: { href: string; emoji: string; label: string; sub: string }) {
  return <Link href={href} className="card text-center transition hover:-translate-y-0.5 hover:shadow-xl"><div className="mb-1 text-3xl">{emoji}</div><p className="font-semibold">{label}</p><p className="text-xs text-slate-500">{sub}</p></Link>;
}

function InfoCard({ title, value, color }: { title: string; value: string; color: string }) {
  return <div className="card overflow-hidden p-0"><div className={`h-1 w-full bg-gradient-to-r ${color}`} /><div className="p-4"><p className="text-sm text-slate-500">{title}</p><p className="text-3xl font-bold">{value}</p></div></div>;
}
