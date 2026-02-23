'use client';

import { useEffect, useState } from 'react';
import { financeApi, billingApi, iotApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
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
        const start = new Date(today); start.setHours(0, 0, 0, 0);
        const end = new Date(today); end.setHours(23, 59, 59, 999);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Owner</h1>
        <p className="text-slate-400">Ringkasan hari ini — {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* IoT Alerts */}
      {offlineDevices.length > 0 && (
        <div className="card border-orange-500/30 bg-orange-500/5">
          <h3 className="font-semibold text-orange-400 mb-2">⚠ Perangkat IoT Offline</h3>
          <div className="flex flex-wrap gap-2">
            {offlineDevices.map((d: any) => (
              <span key={d.id} className="badge bg-orange-500/20 text-orange-300 px-3 py-1">
                {d.name || d.id} — offline
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-slate-400 text-sm">Total Pendapatan</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(report?.revenue?.total || 0)}</p>
          <p className="text-xs text-slate-500 mt-1">Hari ini</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Billiard</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{formatCurrency(report?.revenue?.billiard || 0)}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">F&B</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{formatCurrency(report?.revenue?.fnb || 0)}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Profit Bersih</p>
          <p className={`text-2xl font-bold mt-1 ${parseFloat(report?.netProfit || '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(report?.netProfit || 0)}
          </p>
        </div>
      </div>

      {/* Active Sessions + Per Table Revenue */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Sesi Aktif ({activeSessions.length})</h3>
            <Link href="/owner/billing" className="text-xs text-blue-400">Kelola →</Link>
          </div>
          {activeSessions.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">Tidak ada sesi aktif</p>
          ) : (
            <div className="space-y-2">
              {activeSessions.map((s) => (
                <div key={s.id} className="flex justify-between items-center p-2 bg-slate-700 rounded text-sm">
                  <span>{s.table?.name}</span>
                  <span className="font-medium text-green-400">{formatCurrency(s.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Pendapatan Per Meja</h3>
            <Link href="/owner/finance" className="text-xs text-blue-400">Detail →</Link>
          </div>
          {!report?.perTable?.length ? (
            <p className="text-slate-400 text-sm text-center py-4">Belum ada data</p>
          ) : (
            <div className="space-y-2">
              {report.perTable.slice(0, 5).map((t: any) => (
                <div key={t.tableId} className="flex justify-between items-center p-2 bg-slate-700 rounded text-sm">
                  <div>
                    <span>{t.tableName}</span>
                    <span className="text-slate-400 ml-2 text-xs">{t.sessions} sesi</span>
                  </div>
                  <span className="font-medium">{formatCurrency(t.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment Methods */}
      {report?.paymentMethods?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Metode Pembayaran</h3>
          <div className="flex gap-4">
            {report.paymentMethods.map((p: any) => (
              <div key={p.method} className="flex-1 p-3 bg-slate-700 rounded-lg text-center">
                <p className="text-slate-400 text-xs">{p.method}</p>
                <p className="font-bold">{formatCurrency(p.total)}</p>
                <p className="text-slate-400 text-xs">{p.count} transaksi</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Laporan', href: '/owner/finance', icon: '📊' },
          { label: 'Billing', href: '/owner/billing', icon: '🎱' },
          { label: 'Users', href: '/owner/users', icon: '👥' },
          { label: 'Audit Log', href: '/owner/audit', icon: '📋' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card text-center hover:bg-slate-700 transition-colors">
            <div className="text-2xl mb-1">{item.icon}</div>
            <p className="text-sm font-medium">{item.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
