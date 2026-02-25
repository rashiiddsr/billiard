'use client';

import { useEffect, useState } from 'react';
import { tablesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function OwnerTablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setTables(await tablesApi.list(true));
    } catch {
      toast.error('Gagal memuat meja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRate = async (id: string, hourlyRate: number) => {
    try {
      await tablesApi.update(id, { hourlyRate });
      toast.success('Harga meja diperbarui');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal update harga');
    }
  };

  const toggleActive = async (table: any) => {
    try {
      await tablesApi.update(table.id, { isActive: !table.isActive });
      toast.success(`Meja ${!table.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal ubah status');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Manajemen Meja (Owner)</h1>
      <p className="text-slate-500">Owner hanya bisa mengatur harga dan status aktif/nonaktif meja.</p>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Nama</th><th>Harga/Jam</th><th>Status</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="text-center py-6">Memuat...</td></tr> : tables.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">{t.id}</td>
                  <td>{t.name}</td>
                  <td>
                    <input
                      type="number"
                      defaultValue={Number(t.hourlyRate)}
                      className="input max-w-[160px]"
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isNaN(value)) updateRate(t.id, value);
                      }}
                    />
                    <div className="text-xs text-slate-500 mt-1">{formatCurrency(Number(t.hourlyRate))}</div>
                  </td>
                  <td>{t.isActive ? 'Aktif' : 'Nonaktif'}</td>
                  <td><button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => toggleActive(t)}>{t.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
