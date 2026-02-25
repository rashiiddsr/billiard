'use client';

import { useEffect, useState } from 'react';
import { menuApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function MenuCategoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [skuPrefix, setSkuPrefix] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
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

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSkuPrefix('');
    setShowModal(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setName(row.name);
    setSkuPrefix(row.skuPrefix);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
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
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan kategori');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCategory = async (row: any) => {
    if (row.lastSkuNumber > 0) {
      toast.error('Kategori tidak bisa dihapus karena masih memiliki produk');
      return;
    }

    if (!window.confirm(`Hapus kategori ${row.name}?`)) {
      return;
    }

    try {
      await menuApi.deleteCategory(row.id);
      toast.success('Kategori dihapus');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghapus kategori');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Kategori</h1>
        <button className="btn-primary" onClick={openCreate}>+ Tambah Kategori</button>
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
                  <td>
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded" onClick={() => openEdit(row)}>Edit</button>
                      {row.lastSkuNumber === 0 && (
                        <button className="text-xs px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200" onClick={() => deleteCategory(row)}>Hapus</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">{editing ? 'Edit Kategori' : 'Tambah Kategori'}</h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Nama Kategori</label>
                <input className="input" placeholder="Nama kategori" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">SKU Prefix</label>
                <input className="input" placeholder="SKU Prefix (contoh: BEV)" value={skuPrefix} onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())} />
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn-secondary flex-1" onClick={closeModal}>Batal</button>
                <button className="btn-primary flex-1" onClick={submit} disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
