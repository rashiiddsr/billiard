'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { menuApi, stockApi, financeApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

const toArray = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

export default function ManagerDashboard() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [todayExpense, setTodayExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [menus, stock, report] = await Promise.all([
        menuApi.list(),
        stockApi.getLowStockAlerts(),
        financeApi.getDailyReport(new Date().toISOString().split('T')[0]),
      ]);
      setMenuItems(toArray(menus));
      setLowStock(toArray(stock));
      setTodayExpense(Number(report?.expense?.total || 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = useMemo(
    () =>
      menuItems.reduce((acc: Record<string, number>, item: any) => {
        const key = item?.category?.name || item?.category || 'Lainnya';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    [menuItems],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-3xl font-bold">Dashboard Manager</h1>
        <p className="text-slate-500">Kontrol menu, stok, dan biaya operasional.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <ColorCard title="Total Menu" value={`${menuItems.length}`} tone="bg-cyan-50" />
        <ColorCard title="Stok Menipis" value={`${lowStock.length}`} tone="bg-rose-50" />
        <ColorCard title="Kategori" value={`${Object.keys(categories).length}`} tone="bg-violet-50" />
        <ColorCard title="Biaya Hari Ini" value={formatCurrency(todayExpense)} tone="bg-amber-50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Distribusi Menu per Kategori</h3>
            <Link href="/manager/menu" className="text-sm text-blue-600">
              Kelola menu →
            </Link>
          </div>
          <div className="space-y-3">
            {Object.entries(categories).map(([name, count]) => {
              const max = Math.max(...Object.values(categories), 1);
              return (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{name}</span>
                    <span>{count} item</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(categories).length === 0 && (
              <p className="text-sm text-slate-500">Belum ada data kategori menu.</p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold text-rose-600">Prioritas Stok</h3>
          <div className="space-y-2">
            {lowStock.slice(0, 6).map((s) => (
              <div key={s.id} className="rounded-xl bg-rose-50 p-2 text-sm">
                <p className="font-medium">{s.menuItem?.name || s.name}</p>
                <p className="text-xs text-rose-600">Tersisa {s.qtyOnHand} / min {s.lowStockThreshold}</p>
              </div>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-slate-500">Semua stok aman 🎉</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorCard({ title, value, tone }: { title: string; value: string; tone: string }) {
  return (
    <div className={`card ${tone}`}>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
