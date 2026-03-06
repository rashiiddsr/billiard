'use client';

import { useEffect, useState } from 'react';
import { stockApi } from '@/lib/api';
import toast from 'react-hot-toast';

const ASSET_CATEGORIES = [
  'Meja Biliar',
  'Bola & Segitiga',
  'Stick Biliar',
  'Kapur & Aksesoris',
  'Pencahayaan Meja',
  'Furniture Area',
  'Perangkat Kasir',
  'Lainnya',
] as const;


export default function StockPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState('');
  const [newAssetCustomCategory, setNewAssetCustomCategory] = useState('');
  const [newAssetGood, setNewAssetGood] = useState('0');
  const [newAssetBad, setNewAssetBad] = useState('0');
  const [newAssetNotes, setNewAssetNotes] = useState('');

  const [assetModal, setAssetModal] = useState<any>(null);
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] = useState('');
  const [assetCustomCategory, setAssetCustomCategory] = useState('');
  const [assetGood, setAssetGood] = useState('');
  const [assetBad, setAssetBad] = useState('');
  const [assetNotes, setAssetNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const ass = await stockApi.getAssets();
      setAssets(ass || []);
    } catch (e) {
      toast.error('Gagal memuat data aset');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const resetCreateForm = () => {
    setNewAssetName('');
    setNewAssetCategory('');
    setNewAssetCustomCategory('');
    setNewAssetGood('0');
    setNewAssetBad('0');
    setNewAssetNotes('');
  };

  const submitCreateAsset = async () => {
    const finalCategory = newAssetCategory === 'Lainnya' ? newAssetCustomCategory.trim() : newAssetCategory.trim();

    if (!newAssetName.trim() || !finalCategory) {
      toast.error('Nama dan kategori aset wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      await stockApi.createAsset({
        name: newAssetName.trim(),
        category: finalCategory,
        qtyGood: newAssetGood ? parseInt(newAssetGood, 10) : 0,
        qtyBad: newAssetBad ? parseInt(newAssetBad, 10) : 0,
        notes: newAssetNotes.trim() || undefined,
      });
      toast.success('Aset berhasil ditambahkan');
      setShowCreateModal(false);
      resetCreateForm();
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menambahkan aset');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAssetUpdate = async () => {
    const finalCategory = assetCategory === 'Lainnya' ? assetCustomCategory.trim() : assetCategory.trim();
    if (!assetName.trim() || !finalCategory || !assetGood || !assetBad) { toast.error('Nama, kategori, dan jumlah aset wajib diisi'); return; }

    const nextGood = parseInt(assetGood, 10);
    const nextBad = parseInt(assetBad, 10);

    setSubmitting(true);
    try {
      await stockApi.updateAsset(assetModal.id, {
        name: assetName.trim(),
        category: finalCategory,
        qtyGood: nextGood,
        qtyBad: nextBad,
        notes: assetNotes || undefined,
      });
      toast.success('Aset diperbarui');
      setAssetModal(null);
      setAssetName('');
      setAssetCategory('');
      setAssetCustomCategory('');
      setAssetGood('');
      setAssetBad('');
      setAssetNotes('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Aset</h1>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ Tambah Aset</button>
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
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Memuat...</td></tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.name}</td>
                    <td><span className="badge bg-slate-100 text-slate-700">{a.category}</span></td>
                    <td className="text-green-400 font-bold text-lg">{a.qtyGood}</td>
                    <td className={`font-bold text-lg ${a.qtyBad > 0 ? 'text-red-400' : 'text-slate-500'}`}>{a.qtyBad}</td>
                    <td>{a.qtyGood + a.qtyBad}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setAssetModal(a);
                            setAssetName(a.name || '');
                            const hasPreset = ASSET_CATEGORIES.includes(a.category as any);
                            setAssetCategory(hasPreset ? a.category : 'Lainnya');
                            setAssetCustomCategory(hasPreset ? '' : (a.category || ''));
                            setAssetGood(a.qtyGood.toString());
                            setAssetBad(a.qtyBad.toString());
                            setAssetNotes(a.notes || '');
                          }}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Hapus aset ${a.name}?`)) return;
                            try {
                              await stockApi.deleteAsset(a.id);
                              toast.success('Aset dihapus');
                              fetchData();
                            } catch (e: any) {
                              toast.error(e?.response?.data?.message || 'Gagal menghapus aset');
                            }
                          }}
                          className="text-xs px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update Asset Modal */}
      {assetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Perbarui — {assetModal.name}</h3>
              <button onClick={() => setAssetModal(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Nama Aset <span className="text-red-500">*</span></label>
                <input className="input" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
              </div>
              <div>
                <label className="label">Kategori <span className="text-red-500">*</span></label>
                <select className="input" value={assetCategory} onChange={(e) => setAssetCategory(e.target.value)}>
                  <option value="">Pilih kategori</option>
                  {ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              {assetCategory === 'Lainnya' && (
                <div>
                  <label className="label">Kategori Lainnya <span className="text-red-500">*</span></label>
                  <input className="input" value={assetCustomCategory} onChange={(e) => setAssetCustomCategory(e.target.value)} placeholder="Masukkan kategori aset" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-green-500">Kondisi Baik <span className="text-red-500">*</span></label>
                  <input type="number" className="input" value={assetGood} onChange={(e) => setAssetGood(e.target.value)} min={0} />
                </div>
                <div>
                  <label className="label text-red-500">Kondisi Rusak <span className="text-red-500">*</span></label>
                  <input type="number" className="input" value={assetBad} onChange={(e) => setAssetBad(e.target.value)} min={0} />
                </div>
              </div>
              <div>
                <label className="label">Catatan</label>
                <input className="input" value={assetNotes} onChange={(e) => setAssetNotes(e.target.value)} placeholder="Keterangan..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAssetModal(null)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submitAssetUpdate} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? '...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Tambah Aset Baru</h3>
              <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Nama Aset <span className="text-red-500">*</span></label>
                <input className="input" placeholder="Contoh: Bola Biliar" value={newAssetName} onChange={(e) => setNewAssetName(e.target.value)} />
              </div>
              <div>
                <label className="label">Kategori <span className="text-red-500">*</span></label>
                <select className="input" value={newAssetCategory} onChange={(e) => setNewAssetCategory(e.target.value)}>
                  <option value="">Pilih kategori</option>
                  {ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              {newAssetCategory === 'Lainnya' && (
                <div>
                  <label className="label">Kategori Lainnya <span className="text-red-500">*</span></label>
                  <input className="input" placeholder="Masukkan kategori aset" value={newAssetCustomCategory} onChange={(e) => setNewAssetCustomCategory(e.target.value)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-green-500">Kondisi Baik</label>
                  <input type="number" min={0} className="input" value={newAssetGood} onChange={(e) => setNewAssetGood(e.target.value)} />
                </div>
                <div>
                  <label className="label text-red-500">Kondisi Rusak</label>
                  <input type="number" min={0} className="input" value={newAssetBad} onChange={(e) => setNewAssetBad(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Catatan</label>
                <input className="input" placeholder="Opsional" value={newAssetNotes} onChange={(e) => setNewAssetNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="btn-secondary flex-1">Batal</button>
                <button onClick={submitCreateAsset} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
