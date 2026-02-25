'use client';

import { useEffect, useState } from 'react';
import { menuApi, stockApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function MenuManagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const [stockModal, setStockModal] = useState<any>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState('RESTOCK');
  const [adjustNotes, setAdjustNotes] = useState('');

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [taxFlag, setTaxFlag] = useState(false);
  const [description, setDescription] = useState('');
  const [initStock, setInitStock] = useState('0');
  const [stockThreshold, setStockThreshold] = useState('5');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [menuData, catData] = await Promise.all([
        menuApi.list({ search, category: filterCat, isActive: filterActive, limit: 100 }),
        menuApi.categories(),
      ]);
      setItems(menuData.data || []);
      setCategories(catData || []);
    } catch {
      toast.error('Gagal memuat menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    fetchData();
  }, [filterCat, filterActive]);

  const openCreate = () => {
    setEditItem(null);
    setSku(''); setName(''); setCategoryId(''); setPrice(''); setCost('');
    setTaxFlag(false); setDescription('');
    setInitStock('50'); setStockThreshold('5');
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    const foundCategory = categories.find((c) => c.name === item.category);
    setEditItem(item);
    setSku(item.sku); setName(item.name); setCategoryId(foundCategory?.id || '');
    setPrice(item.price); setCost(item.cost || ''); setTaxFlag(item.taxFlag);
    setDescription(item.description || '');
    setInitStock(''); setStockThreshold(item.stock?.lowStockThreshold?.toString() || '5');
    setShowForm(true);
  };

  const onSelectCategory = async (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    if (editItem || !nextCategoryId) return;
    try {
      const nextSku = await menuApi.getNextSku(nextCategoryId);
      setSku(nextSku.sku);
    } catch {
      toast.error('Gagal generate SKU');
    }
  };

  const submit = async () => {
    if (!name || !categoryId || !price) {
      toast.error('Kategori, nama, dan harga wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        sku: editItem ? undefined : sku,
        name,
        categoryId,
        price: parseFloat(price),
        cost: cost ? parseFloat(cost) : undefined,
        taxFlag,
        description: description || undefined,
        initialStock: initStock ? parseInt(initStock) : undefined,
        lowStockThreshold: stockThreshold ? parseInt(stockThreshold) : 5,
      };

      if (editItem) {
        await menuApi.update(editItem.id, data);
        toast.success('Menu diperbarui');
      } else {
        await menuApi.create(data);
        toast.success('Menu ditambahkan');
      }
      setShowForm(false);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item: any) => {
    try {
      await menuApi.update(item.id, { isActive: !item.isActive });
      toast.success(`${item.name} ${!item.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      fetchData();
    } catch {
      toast.error('Gagal mengubah status menu');
    }
  };

  const openStockModal = (item: any) => {
    if (!item.stock) {
      toast.error('Data stok tidak tersedia');
      return;
    }
    setStockModal(item);
    setAdjustQty('');
    setAdjustType('RESTOCK');
    setAdjustNotes('');
  };

  const submitStockAdjustment = async () => {
    if (!adjustQty) {
      toast.error('Masukkan jumlah stok');
      return;
    }

    setSubmitting(true);
    try {
      const delta = adjustType === 'SALE_DEDUCTION' ? -Math.abs(parseInt(adjustQty, 10)) : parseInt(adjustQty, 10);
      await stockApi.adjustStock(stockModal.id, {
        quantityDelta: delta,
        actionType: adjustType,
        notes: adjustNotes || undefined,
      });
      toast.success('Stok menu diperbarui');
      setStockModal(null);
      setAdjustQty('');
      setAdjustNotes('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal memperbarui stok');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Menu</h1>
        <button onClick={openCreate} className="btn-primary">+ Tambah Item</button>
      </div>

      <div className="filter-bar">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
          </span>
          <input className="input w-full pl-9" placeholder="Cari nama/SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Semua Kategori</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className="input w-40" value={filterActive === undefined ? '' : filterActive.toString()} onChange={(e) => setFilterActive(e.target.value === '' ? undefined : e.target.value === 'true')}>
          <option value="">Semua Status</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="font-semibold">{editItem ? 'Edit Item' : 'Tambah Item Baru'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-10 gap-4">
                <div className="col-span-3">
                  <label className="label">SKU</label>
                  <input className="input" value={sku} readOnly disabled placeholder="Pilih kategori" />
                </div>
                <div className="col-span-7">
                  <label className="label">Nama *</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es Teh Manis" />
                </div>
                <div className="col-span-5">
                  <label className="label">Kategori *</label>
                  <select className="input" value={categoryId} onChange={(e) => onSelectCategory(e.target.value)}>
                    <option value="">Pilih kategori</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.skuPrefix})</option>)}
                  </select>
                </div>
                <div className="col-span-5">
                  <label className="label">Harga (Rp) *</label>
                  <input type="number" className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="10000" />
                </div>
                <div className="col-span-5">
                  <label className="label">HPP (Rp)</label>
                  <input type="number" className="input" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="5000" />
                </div>
                {!editItem && (
                  <div className="col-span-5">
                    <label className="label">Stok Awal</label>
                    <input type="number" className="input" value={initStock} onChange={(e) => setInitStock(e.target.value)} />
                  </div>
                )}
                <div className="col-span-5">
                  <label className="label">Batas Stok Rendah</label>
                  <input type="number" className="input" value={stockThreshold} onChange={(e) => setStockThreshold(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Deskripsi</label>
                <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTaxFlag(!taxFlag)} className={`toggle-switch ${taxFlag ? 'active' : ''}`} />
                <span className="text-sm">Kena Pajak (11%)</span>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stockModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Perbarui Stok — {stockModal.name}</h3>
              <button onClick={() => setStockModal(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-100 rounded-lg text-center">
                <p className="text-slate-500 text-sm">Stok Saat Ini</p>
                <p className="text-3xl font-bold">{stockModal.stock?.qtyOnHand || 0}</p>
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
                <input type="number" className="input" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="10" />
              </div>
              <div>
                <label className="label">Catatan</label>
                <input className="input" value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="Keterangan..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStockModal(null)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submitStockAdjustment} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? '...' : 'Simpan'}
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
              <tr>
                <th>SKU</th>
                <th>Nama</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>HPP</th>
                <th>Stok</th>
                <th>Pajak</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="text-center py-8 text-slate-500">Memuat...</td></tr> : items.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-slate-500">Tidak ada item</td></tr> : items.map((item) => {
                const stockLow = item.stock?.trackStock && item.stock?.qtyOnHand <= item.stock?.lowStockThreshold;
                const isOut = item.stock?.trackStock && item.stock?.qtyOnHand === 0;
                return (
                  <tr key={item.id}>
                    <td className="font-mono text-xs text-slate-500">{item.sku}</td>
                    <td className="font-medium">{item.name}</td>
                    <td><span className="badge bg-slate-100 text-slate-700">{item.category}</span></td>
                    <td className="font-medium">{formatCurrency(item.price)}</td>
                    <td className="text-slate-500">{item.cost ? formatCurrency(item.cost) : '-'}</td>
                    <td>
                      <span className={`font-medium ${stockLow ? 'text-red-600' : 'text-slate-700'}`}>{item.stock?.qtyOnHand ?? '-'}</span>
                      {stockLow && <span className="text-xs text-red-600 ml-1">⚠</span>}
                    </td>
                    <td>{item.taxFlag ? <span className="badge bg-amber-100 text-amber-700">11%</span> : '-'}</td>
                    <td>
                      {item.isActive ? (
                        <span className="badge bg-emerald-100 text-emerald-700">Aktif</span>
                      ) : (
                        <span className="badge bg-slate-200 text-slate-700">Nonaktif</span>
                      )}
                      {isOut && <div className="text-xs text-red-600 mt-1">Stok habis</div>}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEdit(item)} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded">Perbarui</button>
                        <button onClick={() => openStockModal(item)} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded">Perbarui Stok</button>
                        <button onClick={() => toggleActive(item)} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded">{item.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
