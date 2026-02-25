'use client';

import { useEffect, useState } from 'react';
import { stockApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function StockPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [assetModal, setAssetModal] = useState<any>(null);
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

  const submitAssetUpdate = async () => {
    if (!assetGood && !assetBad) { toast.error('Masukkan jumlah'); return; }
    setSubmitting(true);
    try {
      await stockApi.updateAsset(assetModal.id, {
        qtyGood: assetGood ? parseInt(assetGood) : undefined,
        qtyBad: assetBad ? parseInt(assetBad) : undefined,
        notes: assetNotes || undefined,
      });
      toast.success('Aset diperbarui');
      setAssetModal(null);
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
      <h1 className="text-2xl font-bold">Manajemen Aset</h1>

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
                      <button
                        onClick={() => {
                          setAssetModal(a);
                          setAssetGood(a.qtyGood.toString());
                          setAssetBad(a.qtyBad.toString());
                          setAssetNotes('');
                        }}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        Perbarui
                      </button>
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
    </div>
  );
}
