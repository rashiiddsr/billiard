'use client';

import { useEffect, useMemo, useState } from 'react';
import { menuApi, packagesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

type FnbRow = {
  menuItemId?: string;
  quantity: number;
  unitPrice: number;
};

type PackageForm = {
  name: string;
  durationMinutes?: number;
  price: number;
  fnbItems: FnbRow[];
};

const newForm = (): PackageForm => ({
  name: '',
  durationMinutes: undefined,
  price: 0,
  fnbItems: [],
});

export default function PackageManagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState<PackageForm>(newForm());

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pkgData, menuData] = await Promise.all([
        packagesApi.list(),
        menuApi.list({ isActive: true, limit: 500 }),
      ]);
      setItems(pkgData || []);
      setMenuItems(menuData.data || []);
    } catch {
      toast.error('Gagal memuat data paket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => `${x.name} ${x.durationMinutes || ''}`.toLowerCase().includes(q));
  }, [items, search]);

  const openCreate = () => {
    setEditingItem(null);
    setForm(newForm());
    setShowForm(true);
  };

  const openEdit = (pkg: any) => {
    setEditingItem(pkg);
    setForm({
      name: pkg.name || '',
      durationMinutes: pkg.durationMinutes || undefined,
      price: Number(pkg.price || 0),
      fnbItems: (pkg.items || [])
        .filter((it: any) => it.type === 'MENU_ITEM')
        .map((it: any) => ({
          menuItemId: it.menuItemId || undefined,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || 0),
        })),
    });
    setShowForm(true);
  };

  const addFnbRow = () => {
    setForm((prev) => ({ ...prev, fnbItems: [...prev.fnbItems, { menuItemId: undefined, quantity: 1, unitPrice: 0 }] }));
  };

  const updateFnbRow = (idx: number, patch: Partial<FnbRow>) => {
    setForm((prev) => {
      const next = [...prev.fnbItems];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, fnbItems: next };
    });
  };

  const removeFnbRow = (idx: number) => {
    setForm((prev) => ({ ...prev, fnbItems: prev.fnbItems.filter((_, i) => i !== idx) }));
  };

  const buildPayload = (activeFlag: boolean) => {
    const normalizedName = form.name.trim();
    const packageItems: any[] = [];

    if (form.durationMinutes && form.durationMinutes > 0) {
      packageItems.push({ type: 'BILLING', quantity: 1, unitPrice: 0 });
    }

    for (const row of form.fnbItems) {
      if (!row.menuItemId) continue;
      packageItems.push({
        type: 'MENU_ITEM',
        menuItemId: row.menuItemId,
        quantity: Number(row.quantity) || 1,
        unitPrice: Number(row.unitPrice) || 0,
      });
    }

    return {
      name: normalizedName,
      durationMinutes: form.durationMinutes || undefined,
      price: Number(form.price) || 0,
      isActive: activeFlag,
      items: packageItems,
    };
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Nama paket wajib diisi');
    if ((Number(form.price) || 0) < 0) return toast.error('Harga paket tidak valid');
    if (!form.durationMinutes || form.durationMinutes < 1) return toast.error('Billing (menit) wajib diisi');
    if (form.fnbItems.some((x) => !x.menuItemId)) {
      return toast.error('Semua baris F&B wajib pilih menu');
    }

    setSubmitting(true);
    try {
      const payload = buildPayload(editingItem ? !!editingItem.isActive : true);
      if (editingItem) {
        await packagesApi.update(editingItem.id, payload);
        toast.success('Paket diperbarui');
      } else {
        await packagesApi.create(payload);
        toast.success('Paket ditambahkan');
      }
      setShowForm(false);
      await fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal simpan paket');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (pkg: any) => {
    try {
      const payload = {
        name: pkg.name,
        durationMinutes: pkg.durationMinutes || undefined,
        price: Number(pkg.price || 0),
        isActive: !pkg.isActive,
        items: (pkg.items || []).map((it: any) => ({
          type: it.type,
          menuItemId: it.menuItemId || undefined,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || 0),
        })),
      };
      await packagesApi.update(pkg.id, payload);
      toast.success(`Paket ${!pkg.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal ubah status paket');
    }
  };

  const deletePkg = async (pkg: any) => {
    if (!confirm(`Hapus paket ${pkg.name}?`)) return;
    try {
      await packagesApi.remove(pkg.id);
      toast.success('Paket dihapus');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghapus paket');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Manajemen Paket</h1>
      </div>

      <div className="filter-bar justify-between">
        <input className="input max-w-md" placeholder="Cari paket..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={openCreate} className="btn-primary">+ Tambah Paket</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Paket</th>
                <th>Durasi Billing</th>
                <th>Harga</th>
                <th>Item F&B</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="text-center py-8 text-slate-500" colSpan={6}>Memuat data...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="text-center py-8 text-slate-500" colSpan={6}>Tidak ada paket.</td></tr>
              ) : filtered.map((pkg) => {
                const fnbCount = (pkg.items || []).filter((x: any) => x.type === 'MENU_ITEM').length;
                return (
                  <tr key={pkg.id}>
                    <td className="font-medium">{pkg.name}</td>
                    <td>{pkg.durationMinutes ? `${pkg.durationMinutes} menit` : '-'}</td>
                    <td>{formatCurrency(pkg.price)}</td>
                    <td>{fnbCount} item</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleActive(pkg)}
                          className={`toggle-switch ${pkg.isActive ? 'active' : ''}`}
                          title={pkg.isActive ? 'Aktif' : 'Nonaktif'}
                        />
                        <span className={`text-xs font-medium ${pkg.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded" onClick={() => openEdit(pkg)}>Edit</button>
                        <button className="text-xs px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200" onClick={() => deletePkg(pkg)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="font-semibold">{editingItem ? 'Edit Paket' : 'Tambah Paket'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-5">
                  <label className="label">Nama Paket <span className="text-red-500">*</span></label>
                  <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="label">Billing (menit) <span className="text-red-500">*</span></label>
                  <input type="number" min={1} className="input" value={form.durationMinutes || ''} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <label className="label">Harga Paket (Rp) <span className="text-red-500">*</span></label>
                  <input type="number" min={0} className="input" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Item F&B Paket</p>
                  <button className="btn-secondary" onClick={addFnbRow}>Tambah Item F&B</button>
                </div>

                {form.fnbItems.length === 0 && <p className="text-sm text-slate-500">Belum ada item F&B.</p>}

                {form.fnbItems.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-6">
                      <label className="label">Menu F&B <span className="text-red-500">*</span></label>
                      <select
                        className="input"
                        value={row.menuItemId || ''}
                        onChange={(e) => {
                          const selected = menuItems.find((m: any) => m.id === e.target.value);
                          updateFnbRow(idx, {
                            menuItemId: e.target.value || undefined,
                            unitPrice: Number(selected?.price || row.unitPrice || 0),
                          });
                        }}
                      >
                        <option value="">Pilih menu aktif</option>
                        {menuItems.map((m: any) => <option key={m.id} value={m.id}>{m.name} • {formatCurrency(m.price)}</option>)}
                      </select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="label">Qty <span className="text-red-500">*</span></label>
                      <input type="number" min={1} className="input" value={row.quantity} onChange={(e) => updateFnbRow(idx, { quantity: Number(e.target.value) || 1 })} />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <label className="label">Harga Item (Rp) <span className="text-red-500">*</span></label>
                      <input type="number" min={0} className="input" value={row.unitPrice} onChange={(e) => updateFnbRow(idx, { unitPrice: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-12 md:col-span-1 flex items-end">
                      <button className="btn-danger w-full" onClick={() => removeFnbRow(idx)}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
