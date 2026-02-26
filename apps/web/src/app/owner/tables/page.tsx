'use client';

import { useEffect, useState } from 'react';
import { tablesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function OwnerTablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTable, setEditingTable] = useState<any | null>(null);
  const [hourlyRate, setHourlyRate] = useState('');
  const [submittingRate, setSubmittingRate] = useState(false);

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

  const openEditRate = (table: any) => {
    setEditingTable(table);
    setHourlyRate(String(Number(table.hourlyRate)));
  };

  const updateRate = async () => {
    if (!editingTable) return;
    const parsedRate = Number(hourlyRate);
    if (Number.isNaN(parsedRate) || parsedRate < 0) {
      toast.error('Harga/jam wajib berupa angka valid');
      return;
    }

    setSubmittingRate(true);
    try {
      await tablesApi.update(editingTable.id, { hourlyRate: parsedRate });
      toast.success('Harga meja diperbarui');
      setEditingTable(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal update harga');
    } finally {
      setSubmittingRate(false);
    }
  };



  const canStartTesting = (table: any) => table.isActive && table.status === 'AVAILABLE' && (table.billingSessions || []).length === 0;

  const startTesting = async (table: any) => {
    if (!canStartTesting(table)) {
      toast.error('Testing hanya bisa untuk meja OFF (tidak sedang billing)');
      return;
    }

    try {
      await tablesApi.testing(table.id);
      toast.success(`Testing lampu ${table.name} dimulai (±20 detik)`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menjalankan testing lampu');
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

      {editingTable && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Edit Harga Meja</h3>
              <button onClick={() => setEditingTable(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Nama Meja</label>
                <input className="input" value={editingTable.name} disabled />
              </div>
              <div>
                <label className="label">Harga/Jam (Rp) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  className="input"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="25000"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setEditingTable(null)}>Batal</button>
                <button className="btn-primary" onClick={updateRate} disabled={submittingRate}>
                  {submittingRate ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <td>{formatCurrency(Number(t.hourlyRate))}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleActive(t)} className={`toggle-switch ${t.isActive ? 'active' : ''}`} title={t.isActive ? 'Aktif' : 'Nonaktif'} />
                      {t.status === 'MAINTENANCE' && <span className="text-xs font-semibold text-violet-700">Testing</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200" onClick={() => openEditRate(t)}>Edit Harga</button>
                      <button
                        className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => startTesting(t)}
                        disabled={!canStartTesting(t)}
                      >
                        Testing
                      </button>
                    </div>
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
