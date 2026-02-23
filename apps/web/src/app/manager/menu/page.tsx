'use client';

import { useEffect, useState } from 'react';
import { menuApi, stockApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function MenuManagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [taxFlag, setTaxFlag] = useState(false);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
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
      setCategories(catData);
    } catch (e) {
      toast.error('Gagal memuat menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setSku(''); setName(''); setCategory(''); setPrice(''); setCost('');
    setTaxFlag(false); setDescription(''); setIsActive(true);
    setInitStock('50'); setStockThreshold('5');
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setSku(item.sku); setName(item.name); setCategory(item.category);
    setPrice(item.price); setCost(item.cost || ''); setTaxFlag(item.taxFlag);
    setDescription(item.description || ''); setIsActive(item.isActive);
    setInitStock(''); setStockThreshold(item.stock?.lowStockThreshold?.toString() || '5');
    setShowForm(true);
  };

  const submit = async () => {
    if (!sku || !name || !category || !price) {
      toast.error('SKU, nama, kategori, dan harga wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        sku, name, category,
        price: parseFloat(price),
        cost: cost ? parseFloat(cost) : undefined,
        taxFlag,
        description: description || undefined,
        isActive,
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
    } catch (e) {
      toast.error('Gagal');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Menu</h1>
        <button onClick={openCreate} className="btn-primary">+ Tambah Item</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="input flex-1 min-w-48"
          placeholder="Cari nama/SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchData()}
        />
        <select className="input w-40" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Semua Kategori</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="input w-40"
          value={filterActive === undefined ? '' : filterActive.toString()}
          onChange={(e) => setFilterActive(e.target.value === '' ? undefined : e.target.value === 'true')}
        >
          <option value="">Semua Status</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
        <button onClick={fetchData} className="btn-secondary">Filter</button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800">
              <h3 className="font-semibold">{editItem ? 'Edit Item' : 'Tambah Item Baru'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU *</label>
                  <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} disabled={!!editItem} placeholder="BEV-001" />
                </div>
                <div>
                  <label className="label">Nama *</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es Teh Manis" />
                </div>
                <div>
                  <label className="label">Kategori *</label>
                  <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Minuman" list="categories" />
                  <datalist id="categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label">Harga (Rp) *</label>
                  <input type="number" className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="10000" />
                </div>
                <div>
                  <label className="label">HPP (Rp)</label>
                  <input type="number" className="input" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="5000" />
                </div>
                {!editItem && (
                  <div>
                    <label className="label">Stok Awal</label>
                    <input type="number" className="input" value={initStock} onChange={(e) => setInitStock(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="label">Batas Stok Rendah</label>
                  <input type="number" className="input" value={stockThreshold} onChange={(e) => setStockThreshold(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Deskripsi</label>
                <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={taxFlag} onChange={(e) => setTaxFlag(e.target.checked)} />
                  <span className="text-sm">Kena Pajak (11%)</span>
                </label>
                {editItem && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    <span className="text-sm">Aktif</span>
                  </label>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Items Table */}
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
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">Memuat...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">Tidak ada item</td></tr>
              ) : (
                items.map((item) => {
                  const stockLow = item.stock?.trackStock && item.stock?.qtyOnHand <= item.stock?.lowStockThreshold;
                  return (
                    <tr key={item.id}>
                      <td className="font-mono text-xs text-slate-400">{item.sku}</td>
                      <td className="font-medium">{item.name}</td>
                      <td><span className="badge bg-slate-700 text-slate-300">{item.category}</span></td>
                      <td className="font-medium">{formatCurrency(item.price)}</td>
                      <td className="text-slate-400">{item.cost ? formatCurrency(item.cost) : '-'}</td>
                      <td>
                        <span className={`font-medium ${stockLow ? 'text-red-400' : 'text-slate-300'}`}>
                          {item.stock?.qtyOnHand ?? '-'}
                        </span>
                        {stockLow && <span className="text-xs text-red-400 ml-1">⚠</span>}
                      </td>
                      <td>{item.taxFlag ? <span className="badge bg-yellow-500/20 text-yellow-300">11%</span> : '-'}</td>
                      <td>
                        <span className={`badge ${item.isActive ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-400'}`}>
                          {item.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(item)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(item)}
                            className={`text-xs px-2 py-1 rounded ${item.isActive ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40' : 'bg-green-600/20 text-green-400 hover:bg-green-600/40'}`}
                          >
                            {item.isActive ? 'Off' : 'On'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
