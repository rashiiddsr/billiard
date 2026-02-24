'use client';

import { useEffect, useState } from 'react';
import { menuApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function MenuCategoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [skuPrefix, setSkuPrefix] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const data = await menuApi.categories();
      setItems(data || []);
    } catch {
      toast.error('Gagal memuat kategori menu');
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openEdit = (row: any) => {
    setEditing(row);
    setName(row.name);
    setSkuPrefix(row.skuPrefix);
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setSkuPrefix('');
  };

  const submit = async () => {
    if (!name || !skuPrefix) {
      toast.error('Nama kategori dan SKU prefix wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await menuApi.updateCategory(editing.id, { name, skuPrefix });
        toast.success('Kategori diperbarui');
      } else {
        await menuApi.createCategory({ name, skuPrefix });
        toast.success('Kategori ditambahkan');
      }
      resetForm();
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan kategori');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Manajemen Kategori</h1>

      <div className="card">
        <h3 className="font-semibold mb-4">{editing ? 'Edit Kategori' : 'Tambah Kategori'}</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="input" placeholder="Nama kategori" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="SKU Prefix (contoh: BEV)" value={skuPrefix} onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())} />
          <div className="flex gap-2">
            {editing && <button className="btn-secondary" onClick={resetForm}>Batal</button>}
            <button className="btn-primary flex-1" onClick={submit} disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>SKU Prefix</th>
                <th>SKU Terakhir</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-slate-400">Belum ada kategori</td></tr>
              ) : items.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.name}</td>
                  <td className="font-mono">{row.skuPrefix}</td>
                  <td>{row.lastSkuNumber}</td>
                  <td><button className="btn-secondary text-xs py-1" onClick={() => openEdit(row)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
