'use client';

import { useEffect, useState } from 'react';
import { stockApi, menuApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function ManagerDashboard() {
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [menuCount, setMenuCount] = useState({ total: 0, active: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [alerts, assetData, menuData] = await Promise.all([
          stockApi.getLowStockAlerts(),
          stockApi.getAssets(),
          menuApi.list({ limit: 1 }),
        ]);
        setLowStock(alerts);
        setAssets(assetData);
        setMenuCount({ total: menuData.total || 0, active: menuData.total || 0 });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const badAssets = assets.filter((a) => a.qtyBad > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard Manager</h1>

      {/* Alerts */}
      {(lowStock.length > 0 || badAssets.length > 0) && (
        <div className="space-y-3">
          {lowStock.length > 0 && (
            <div className="card border-red-500/30 bg-red-500/5">
              <h3 className="font-semibold text-red-400 mb-2">🔴 Stok F&B Menipis ({lowStock.length})</h3>
              <div className="flex flex-wrap gap-2">
                {lowStock.map((s) => (
                  <span key={s.id} className="badge bg-red-500/20 text-red-300 px-2 py-1">
                    {s.menuItem?.name}: {s.qtyOnHand} sisa
                  </span>
                ))}
              </div>
            </div>
          )}
          {badAssets.length > 0 && (
            <div className="card border-orange-500/30 bg-orange-500/5">
              <h3 className="font-semibold text-orange-400 mb-2">⚠ Aset Bermasalah</h3>
              <div className="flex flex-wrap gap-2">
                {badAssets.map((a) => (
                  <span key={a.id} className="badge bg-orange-500/20 text-orange-300 px-2 py-1">
                    {a.name}: {a.qtyBad} rusak
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Menu Items</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">{menuCount.total}</p>
        </div>
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Stok Menipis</p>
          <p className="text-3xl font-bold text-red-400 mt-1">{lowStock.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Aset Bermasalah</p>
          <p className="text-3xl font-bold text-orange-400 mt-1">{badAssets.length}</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Manajemen Menu', href: '/manager/menu', icon: '🍽', desc: 'Kelola item F&B' },
          { label: 'Manajemen Kategori', href: '/manager/menu-categories', icon: '🏷️', desc: 'Kelola kategori & SKU' },
          { label: 'Stok Operasional', href: '/manager/stock', icon: '📦', desc: 'Kondisi aset billiard' },
          { label: 'Pengeluaran', href: '/manager/expenses', icon: '💸', desc: 'Catat pengeluaran' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card hover:bg-slate-700 transition-colors">
            <div className="text-3xl mb-2">{item.icon}</div>
            <p className="font-semibold">{item.label}</p>
            <p className="text-sm text-slate-400">{item.desc}</p>
          </Link>
        ))}
      </div>

      {/* Operational Assets Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Kondisi Aset Operasional</h3>
          <Link href="/manager/stock" className="text-xs text-blue-400">Perbarui →</Link>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Aset</th>
                <th>Kategori</th>
                <th>Baik</th>
                <th>Rusak</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.name}</td>
                  <td className="text-slate-400">{a.category}</td>
                  <td className="text-green-400">{a.qtyGood}</td>
                  <td className={a.qtyBad > 0 ? 'text-red-400 font-bold' : 'text-slate-400'}>{a.qtyBad}</td>
                  <td>{a.qtyGood + a.qtyBad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
