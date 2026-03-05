'use client';

import { useEffect, useState } from 'react';
import { menuApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function OwnerMenuPage() {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const menuData = await menuApi.list({ limit: 200 });
      setMenuItems(menuData?.data || []);
    } catch {
      toast.error('Gagal memuat data menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Manajemen Menu</h1>

      <div className="card p-0 overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold">Daftar Menu</h2>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nama</th>
                <th>Harga</th>
                <th>Stok</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">Memuat...</td></tr>
              ) : menuItems.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Belum ada menu</td></tr>
              ) : menuItems.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono">{item.sku}</td>
                  <td className="font-medium">{item.name}</td>
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
