'use client';

import { useEffect, useMemo, useState } from 'react';
import { financeApi, billingApi, iotApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function OwnerDashboard() {
  const [report, setReport] = useState<any>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [iotDevices, setIotDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date();
        const [rep, sessions, devices] = await Promise.all([
          financeApi.getDailyReport(today.toISOString().split('T')[0]),
          billingApi.getActiveSessions(),
          iotApi.listDevices().catch(() => []),
        ]);
        setReport(rep);
        setActiveSessions(sessions);
        setIotDevices(devices);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const offlineDevices = iotDevices.filter((d: any) => !d.isOnline);
  const revenueSeries = useMemo(() => (report?.perTable || []).slice(0, 6), [report]);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Dashboard Owner</h1>
        <p className="text-slate-500">Ringkasan hari ini — {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {offlineDevices.length > 0 && (
        <div className="card border-orange-200 bg-orange-50">
          <h3 className="mb-2 font-semibold text-orange-600">⚠ Perangkat IoT Offline</h3>
          <div className="flex flex-wrap gap-2">{offlineDevices.map((d: any) => <span key={d.id} className="badge bg-orange-100 px-3 py-1 text-orange-600">Gateway {d.id} — offline</span>)}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Pendapatan" value={formatCurrency(report?.revenue?.total || 0)} accent="from-emerald-500 to-green-400" />
        <StatCard title="Billiard" value={formatCurrency(report?.revenue?.billiard || 0)} accent="from-blue-500 to-cyan-400" />
        <StatCard title="F&B" value={formatCurrency(report?.revenue?.fnb || 0)} accent="from-fuchsia-500 to-purple-400" />
        <StatCard title="Profit Bersih" value={formatCurrency(report?.netProfit || 0)} accent="from-amber-500 to-yellow-400" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">Grafik Pendapatan per Meja</h3>
            <Link href="/owner/finance" className="text-sm text-blue-600">Detail →</Link>
          </div>
          {revenueSeries.length === 0 ? <p className="text-sm text-slate-500">Belum ada data</p> : (
            <div className="space-y-3">
              {revenueSeries.map((t: any, idx: number) => {
                const max = Math.max(...revenueSeries.map((x: any) => x.revenue), 1);
                const width = (t.revenue / max) * 100;
                const colors = ['bg-cyan-400', 'bg-blue-400', 'bg-violet-400', 'bg-fuchsia-400', 'bg-emerald-400', 'bg-amber-400'];
                return (
                  <div key={t.tableId}>
                    <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{t.tableName}</span><span>{formatCurrency(t.revenue)}</span></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${colors[idx % colors.length]}`} style={{ width: `${width}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Sesi Aktif ({activeSessions.length})</h3><Link href="/owner/billing" className="text-sm text-blue-600">Kelola</Link></div>
          {activeSessions.length === 0 ? <p className="text-sm text-slate-500">Tidak ada sesi aktif</p> : (
            <div className="space-y-2">{activeSessions.map((s) => <div key={s.id} className="rounded-xl bg-slate-50 p-2 text-sm"><div className="flex justify-between"><span>{s.table?.name}</span><span className="font-semibold text-emerald-600">{formatCurrency(s.totalAmount)}</span></div></div>)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, accent }: { title: string; value: string; accent: string }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
