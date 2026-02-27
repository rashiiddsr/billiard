'use client';

import { useEffect, useState } from 'react';
import { stockApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function OwnerStockPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const data = await stockApi.getAssets();
      setAssets(data || []);
    } catch {
      toast.error('Gagal memuat data aset');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssets(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manajemen Aset</h1>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Kategori</th>
                <th className="text-green-400">Baik</th>
                <th className="text-red-400">Rusak</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-500">Memuat...</td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Belum ada aset</td></tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.name}</td>
                    <td><span className="badge bg-slate-100 text-slate-700">{a.category}</span></td>
                    <td className="text-green-400 font-bold text-lg">{a.qtyGood}</td>
                    <td className={`font-bold text-lg ${a.qtyBad > 0 ? 'text-red-400' : 'text-slate-500'}`}>{a.qtyBad}</td>
                    <td>{a.qtyGood + a.qtyBad}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
