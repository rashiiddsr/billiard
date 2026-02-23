'use client';

import { useEffect, useState, useCallback } from 'react';
import { billingApi, paymentsApi, stockApi } from '@/lib/api';
import { formatCurrency, formatTime, getRemainingTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function CashierDashboard() {
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [sessions, payments, alerts] = await Promise.all([
        billingApi.getActiveSessions(),
        paymentsApi.list({ status: 'PENDING_PAYMENT', limit: 10 }),
        stockApi.getLowStockAlerts(),
      ]);
      setActiveSessions(sessions);
      setPendingPayments(payments.data || []);
      setLowStock(alerts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clockInterval); };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Kasir</h1>
          <p className="text-slate-400">{now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-mono font-bold text-blue-400">{formatTime(now)}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-slate-400 text-sm">Meja Aktif</p>
          <p className="text-3xl font-bold text-green-400 mt-1">{activeSessions.length}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Menunggu Bayar</p>
          <p className="text-3xl font-bold text-yellow-400 mt-1">{pendingPayments.length}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Stok Menipis</p>
          <p className="text-3xl font-bold text-red-400 mt-1">{lowStock.length}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <Link href="/cashier/billing" className="card hover:bg-slate-700 transition-colors text-center cursor-pointer">
          <div className="text-3xl mb-2">🎱</div>
          <p className="font-medium">Mulai Billing</p>
          <p className="text-xs text-slate-400">Kelola sesi meja</p>
        </Link>
        <Link href="/cashier/orders" className="card hover:bg-slate-700 transition-colors text-center cursor-pointer">
          <div className="text-3xl mb-2">🍔</div>
          <p className="font-medium">Pesanan F&B</p>
          <p className="text-xs text-slate-400">Tambah menu F&B</p>
        </Link>
        <Link href="/cashier/checkout" className="card hover:bg-slate-700 transition-colors text-center cursor-pointer">
          <div className="text-3xl mb-2">💳</div>
          <p className="font-medium">Checkout</p>
          <p className="text-xs text-slate-400">Proses pembayaran</p>
        </Link>
      </div>

      {/* Active Sessions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Sesi Aktif</h2>
          <Link href="/cashier/billing" className="text-sm text-blue-400 hover:text-blue-300">Lihat Semua →</Link>
        </div>
        {activeSessions.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Tidak ada sesi aktif</p>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => {
              const remaining = getRemainingTime(session.endTime);
              return (
                <div key={session.id} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${remaining.isWarning ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                    <div>
                      <p className="font-medium">{session.table?.name}</p>
                      <p className="text-xs text-slate-400">
                        Mulai: {new Date(session.startTime).toLocaleTimeString('id-ID')} •
                        {' '}{session.createdBy?.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono font-bold text-sm ${remaining.isWarning ? 'text-red-400' : remaining.isExpired ? 'text-gray-400' : 'text-green-400'}`}>
                      {remaining.text}
                    </p>
                    <p className="text-xs text-slate-400">{formatCurrency(session.totalAmount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Payments */}
      {pendingPayments.length > 0 && (
        <div className="card border-yellow-500/30">
          <h2 className="font-semibold text-lg mb-4 text-yellow-400">⚠ Menunggu Konfirmasi Bayar</h2>
          <div className="space-y-2">
            {pendingPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{p.paymentNumber}</p>
                  <p className="text-xs text-slate-400">{p.billingSession?.table?.name || 'Standalone'} • {p.method}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold">{formatCurrency(p.totalAmount)}</p>
                  <Link href={`/cashier/checkout?paymentId=${p.id}`} className="btn-primary text-xs py-1 px-3">
                    Proses
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div className="card border-red-500/30">
          <h2 className="font-semibold text-lg mb-3 text-red-400">🔴 Stok Menipis</h2>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((s) => (
              <span key={s.id} className="badge bg-red-500/20 text-red-300 border border-red-500/30 px-3 py-1">
                {s.menuItem?.name} ({s.qtyOnHand} tersisa)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
