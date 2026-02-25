'use client';

import { useEffect, useState } from 'react';
import { tablesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function DeveloperTablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', relayChannel: '', gpioPin: '', hourlyRate: '' });

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

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', relayChannel: '', gpioPin: '', hourlyRate: '' });
    setShowForm(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({ name: t.name, relayChannel: t.relayChannel, gpioPin: t.gpioPin, hourlyRate: t.hourlyRate });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name || form.relayChannel === '' || form.gpioPin === '' || form.hourlyRate === '') {
      toast.error('Nama, relay CH, GPIO pin, dan harga wajib diisi');
      return;
    }

    try {
      const payload = {
        name: form.name,
        relayChannel: Number(form.relayChannel),
        gpioPin: Number(form.gpioPin),
        hourlyRate: Number(form.hourlyRate),
      };

      if (editing) {
        await tablesApi.update(editing.id, payload);
        toast.success('Data meja diperbarui');
      } else {
        await tablesApi.create(payload);
        toast.success('Meja baru ditambahkan');
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan meja');
    }
  };

  const toggleActive = async (table: any) => {
    try {
      await tablesApi.update(table.id, { isActive: !table.isActive });
      toast.success(`Meja ${!table.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      load();
    } catch {
      toast.error('Gagal mengubah status meja');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Meja (Developer)</h1>
        <button className="btn-primary" onClick={openCreate}>+ Tambah Meja</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg p-4 space-y-3">
            <h3 className="font-semibold">{editing ? 'Edit Meja' : 'Tambah Meja Baru'}</h3>
            <input className="input" placeholder="Nama meja" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" className="input" placeholder="Relay CH" value={form.relayChannel} onChange={(e) => setForm({ ...form, relayChannel: e.target.value })} />
              <input type="number" className="input" placeholder="GPIO Pin" value={form.gpioPin} onChange={(e) => setForm({ ...form, gpioPin: e.target.value })} />
            </div>
            <input type="number" className="input" placeholder="Harga per jam" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-primary" onClick={save}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Nama</th><th>Relay CH</th><th>GPIO</th><th>Harga/Jam</th><th>Status</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-6">Memuat...</td></tr> : tables.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">{t.id}</td>
                  <td>{t.name}</td>
                  <td>{t.relayChannel}</td>
                  <td>{t.gpioPin}</td>
                  <td>{formatCurrency(Number(t.hourlyRate))}</td>
                  <td>{t.isActive ? 'Aktif' : 'Nonaktif'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => openEdit(t)}>Edit</button>
                      <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => toggleActive(t)}>{t.isActive ? 'OFF' : 'ON'}</button>
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
