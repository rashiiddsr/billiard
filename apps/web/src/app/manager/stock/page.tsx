'use client';

import { useEffect, useState } from 'react';
import { stockApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function StockPage() {
  const [tab, setTab] = useState<'fnb' | 'assets'>('fnb');
  const [fnbStock, setFnbStock] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [adjustModal, setAdjustModal] = useState<any>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState('RESTOCK');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [assetModal, setAssetModal] = useState<any>(null);
  const [assetGood, setAssetGood] = useState('');
  const [assetBad, setAssetBad] = useState('');
  const [assetNotes, setAssetNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fnb, ass] = await Promise.all([
        stockApi.getFnbStock(),
        stockApi.getAssets(),
      ]);
      setFnbStock(fnb);
      setAssets(ass);
    } catch (e) {
      toast.error('Gagal memuat data stok');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const submitAdjustment = async () => {
    if (!adjustQty) { toast.error('Masukkan jumlah'); return; }
    setSubmitting(true);
    try {
      const delta = adjustType === 'SALE_DEDUCTION' ? -Math.abs(parseInt(adjustQty)) : parseInt(adjustQty);
      await stockApi.adjustStock(adjustModal.menuItemId, {
        quantityDelta: delta,
        actionType: adjustType,
        notes: adjustNotes || undefined,
      });
      toast.success('Stok diperbarui');
      setAdjustModal(null);
      setAdjustQty('');
      setAdjustNotes('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };

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
      <h1 className="text-2xl font-bold">Manajemen Stok</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('fnb')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'fnb' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          🍔 Stok F&B
        </button>
        <button
          onClick={() => setTab('assets')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'assets' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          🎱 Aset Operasional
        </button>
      </div>

      {/* F&B Stock */}
      {tab === 'fnb' && (
        <div className="card p-0 overflow-hidden">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nama</th>
                  <th>Kategori</th>
                  <th>Stok</th>
                  <th>Batas Rendah</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-500">Memuat...</td></tr>
                ) : (
                  fnbStock.map((s) => {
                    const isLow = s.trackStock && s.qtyOnHand <= s.lowStockThreshold;
                    const isOut = s.trackStock && s.qtyOnHand === 0;
                    return (
                      <tr key={s.id}>
                        <td className="font-mono text-xs text-slate-500">{s.menuItem?.sku}</td>
                        <td className="font-medium">{s.menuItem?.name}</td>
                        <td><span className="badge bg-slate-100 text-slate-700">{s.menuItem?.category}</span></td>
                        <td>
                          <span className={`font-bold text-lg ${isOut ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                            {s.qtyOnHand}
                          </span>
                        </td>
                        <td className="text-slate-500">{s.lowStockThreshold}</td>
                        <td>
                          {isOut ? (
                            <span className="badge bg-red-100 text-red-700">Habis</span>
                          ) : isLow ? (
                            <span className="badge bg-amber-100 text-amber-700">⚠ Menipis</span>
                          ) : (
                            <span className="badge bg-emerald-100 text-emerald-700">Normal</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => { setAdjustModal(s); setAdjustQty(''); setAdjustType('RESTOCK'); setAdjustNotes(''); }}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                          >
                            Perbarui
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operational Assets */}
      {tab === 'assets' && (
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
      )}

      {/* Adjust Stock Modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Perbarui Stok — {adjustModal.menuItem?.name}</h3>
              <button onClick={() => setAdjustModal(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-100 rounded-lg text-center">
                <p className="text-slate-500 text-sm">Stok Saat Ini</p>
                <p className="text-3xl font-bold">{adjustModal.qtyOnHand}</p>
              </div>
              <div>
                <label className="label">Tipe Penyesuaian</label>
                <select className="input" value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
                  <option value="RESTOCK">Restok (+)</option>
                  <option value="MANUAL_ADJUSTMENT">Penyesuaian Manual (±)</option>
                  <option value="SALE_DEDUCTION">Pengurangan Manual (-)</option>
                </select>
              </div>
              <div>
                <label className="label">Jumlah</label>
                <input
                  type="number"
                  className="input"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div>
                <label className="label">Catatan</label>
                <input className="input" value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="Keterangan..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAdjustModal(null)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submitAdjustment} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? '...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <label className="label text-green-400">Kondisi Baik</label>
                  <input type="number" className="input" value={assetGood} onChange={(e) => setAssetGood(e.target.value)} min={0} />
                </div>
                <div>
                  <label className="label text-red-400">Kondisi Rusak</label>
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
