'use client';

import { useEffect, useMemo, useState } from 'react';
import { menuApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function OwnerMenuCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catData, menuData] = await Promise.all([
        menuApi.categories(),
        menuApi.list({ limit: 200 }),
      ]);
      setCategories(catData || []);
      setMenuItems(menuData?.data || []);
    } catch {
      toast.error('Gagal memuat data kategori & menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const menuCountByCategory = useMemo(() => {
    return menuItems.reduce((acc: Record<string, number>, item: any) => {
      const key = item.category || '-';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [menuItems]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Manajemen Kategori (Read Only)</h1>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Kategori</th>
                <th>SKU Prefix</th>
                <th>SKU Terakhir</th>
                <th>Jumlah Menu</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-6 text-center text-slate-500">Memuat...</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">Belum ada kategori</td></tr>
              ) : categories.map((cat) => (
                <tr key={cat.id}>
                  <td className="font-medium">{cat.name}</td>
                  <td className="font-mono">{cat.skuPrefix}</td>
                  <td>{cat.lastSkuNumber}</td>
                  <td>{menuCountByCategory[cat.name] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold">Daftar Menu</h2>
          <p className="text-sm text-slate-500">Owner hanya dapat melihat data menu dan stok saat ini.</p>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nama</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Stok</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">Memuat...</td></tr>
              ) : menuItems.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">Belum ada menu</td></tr>
              ) : menuItems.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono">{item.sku}</td>
                  <td className="font-medium">{item.name}</td>
                  <td>{item.category}</td>
                  <td>{formatCurrency(item.price)}</td>
                  <td>{item.stock?.qtyOnHand ?? 0}</td>
                  <td>
                    <span className={`badge ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {item.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
