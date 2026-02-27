'use client';

import { useEffect, useMemo, useState } from 'react';
import { menuApi, packagesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

type PackageItem = {
  type: 'BILLING' | 'MENU_ITEM';
  menuItemId?: string;
  quantity: number;
  unitPrice: number;
};

type PackageForm = {
  name: string;
  durationMinutes?: number;
  price: number;
  isActive: boolean;
  items: PackageItem[];
};

const baseForm = (): PackageForm => ({
  name: '',
  durationMinutes: 120,
  price: 0,
  isActive: true,
  items: [{ type: 'BILLING', quantity: 1, unitPrice: 0 }],
});

export default function PackageManagementPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState<any>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageForm>(baseForm());

  const load = async () => {
    setLoading(true);
    try {
      const [pkgRes, menuRes] = await Promise.all([
        packagesApi.list(),
        menuApi.list({ limit: 500, isActive: true }),
      ]);
      setPackages(pkgRes || []);
      setMenuItems(menuRes.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal memuat data paket/menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((pkg) =>
      `${pkg.name} ${pkg.durationMinutes || ''}`.toLowerCase().includes(q),
    );
  }, [packages, search]);

  const resetForm = () => {
    setEditingId(null);
    setForm(baseForm());
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (pkg: any) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      durationMinutes: pkg.durationMinutes || undefined,
      price: Number(pkg.price || 0),
      isActive: !!pkg.isActive,
      items: (pkg.items || []).map((item: any) => ({
        type: item.type,
        menuItemId: item.menuItemId || undefined,
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
      })),
    });
    setShowForm(true);
  };

  const updateItem = (index: number, next: Partial<PackageItem>) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...next };
      return { ...prev, items };
    });
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, { type: 'MENU_ITEM', quantity: 1, unitPrice: 0 }] }));
  };

  const validateForm = () => {
    if (!form.name.trim()) return 'Nama paket wajib diisi';
    if (!Number.isFinite(form.price) || form.price < 0) return 'Harga paket tidak valid';
    if (!form.items.length) return 'Minimal 1 item paket';

    const billingItems = form.items.filter((x) => x.type === 'BILLING');
    if (billingItems.length > 1) return 'Item billing maksimal 1';
    if (billingItems.length === 1 && (!form.durationMinutes || form.durationMinutes < 1)) {
      return 'Durasi billing wajib diisi untuk item billing';
    }

    for (const item of form.items) {
      if (item.quantity < 1) return 'Kuantitas item minimal 1';
      if (item.unitPrice < 0) return 'Harga item tidak boleh negatif';
      if (item.type === 'MENU_ITEM' && !item.menuItemId) return 'Item F&B wajib pilih menu';
    }

    return null;
  };

  const submit = async () => {
    const err = validateForm();
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        durationMinutes: form.durationMinutes || undefined,
        items: form.items.map((item) => ({
          ...item,
          menuItemId: item.type === 'MENU_ITEM' ? item.menuItemId : undefined,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      };

      if (editingId) {
        await packagesApi.update(editingId, payload);
        toast.success('Paket berhasil diperbarui');
      } else {
        await packagesApi.create(payload);
        toast.success('Paket berhasil ditambahkan');
      }

      setShowForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal simpan paket');
    } finally {
      setSubmitting(false);
    }
  };

  const removePackage = async () => {
    if (!showDelete) return;
    setSubmitting(true);
    try {
      await packagesApi.remove(showDelete.id);
      toast.success('Paket dihapus');
      setShowDelete(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghapus paket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="card border border-sky-200 bg-gradient-to-r from-sky-100 via-blue-100 to-indigo-100 text-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Manajemen Paket</h1>
            <p className="text-sm text-slate-600">Kelola paket billing + F&B dengan data wajib yang jelas dan sinkron dengan menu aktif.</p>
          </div>
          <button onClick={openCreate} className="btn-primary">Tambah Paket</button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <input
            className="input"
            placeholder="Cari nama paket"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-secondary" onClick={() => load()}>Refresh</button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Memuat data...</p>
        ) : filteredPackages.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada paket.</p>
        ) : (
          <div className="space-y-2">
            {filteredPackages.map((pkg) => (
              <div key={pkg.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{pkg.name}</p>
                    <p className="text-xs text-slate-500">Durasi: {pkg.durationMinutes ? `${pkg.durationMinutes} menit` : 'Tanpa durasi billing'} • Harga: {formatCurrency(pkg.price)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(pkg.items || []).map((item: any, idx: number) => (
                        <span key={idx} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {item.type === 'BILLING' ? `Billing ${pkg.durationMinutes || '-'} menit` : `${item.menuItem?.name || 'Menu'} x${item.quantity}`}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${pkg.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{pkg.isActive ? 'Aktif' : 'Nonaktif'}</span>
                    <button className="btn-secondary" onClick={() => openEdit(pkg)}>Edit</button>
                    <button className="btn-danger" onClick={() => setShowDelete(pkg)}>Hapus</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h3 className="font-semibold">{editingId ? 'Edit Paket' : 'Tambah Paket Baru'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6">
                  <label className="label">Nama Paket <span className="text-red-500">*</span></label>
                  <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Contoh: Paket 45" />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="label">Durasi Billing (menit)</label>
                  <input type="number" className="input" value={form.durationMinutes || ''} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Opsional" min={1} />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="label">Harga Paket (Rp) <span className="text-red-500">*</span></label>
                  <input type="number" className="input" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))} min={0} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">Item Paket</p>
                  <button className="btn-secondary" onClick={addItem}>Tambah Item F&B</button>
                </div>

                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                      <div className="col-span-12 md:col-span-2">
                        <label className="label">Jenis <span className="text-red-500">*</span></label>
                        <select
                          className="input"
                          value={item.type}
                          onChange={(e) => {
                            const nextType = e.target.value as 'BILLING' | 'MENU_ITEM';
                            updateItem(idx, {
                              type: nextType,
                              menuItemId: undefined,
                              quantity: nextType === 'BILLING' ? 1 : item.quantity,
                            });
                          }}
                        >
                          <option value="BILLING">Billing</option>
                          <option value="MENU_ITEM">F&B</option>
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-4">
                        <label className="label">Menu F&B {item.type === 'MENU_ITEM' && <span className="text-red-500">*</span>}</label>
                        {item.type === 'MENU_ITEM' ? (
                          <select
                            className="input"
                            value={item.menuItemId || ''}
                            onChange={(e) => {
                              const selected = menuItems.find((m: any) => m.id === e.target.value);
                              updateItem(idx, {
                                menuItemId: e.target.value || undefined,
                                unitPrice: Number(selected?.price || item.unitPrice || 0),
                              });
                            }}
                          >
                            <option value="">Pilih menu aktif</option>
                            {menuItems.map((m: any) => (
                              <option key={m.id} value={m.id}>{m.name} • {formatCurrency(m.price)}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="input" value="Durasi paket billing" disabled readOnly />
                        )}
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <label className="label">Qty <span className="text-red-500">*</span></label>
                        <input type="number" min={1} className="input" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })} disabled={item.type === 'BILLING'} />
                      </div>

                      <div className="col-span-6 md:col-span-3">
                        <label className="label">Harga Item (Rp) <span className="text-red-500">*</span></label>
                        <input type="number" min={0} className="input" value={item.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })} />
                      </div>

                      <div className="col-span-12 md:col-span-1 flex items-end">
                        <button
                          className="btn-danger w-full"
                          onClick={() => removeItem(idx)}
                          disabled={form.items.length === 1}
                          title={form.items.length === 1 ? 'Minimal 1 item' : 'Hapus item'}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
                  Paket aktif (dapat dipilih kasir)
                </label>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan Paket'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold">Hapus paket?</h3>
            <p className="mt-2 text-sm text-slate-600">Paket <span className="font-semibold">{showDelete.name}</span> akan dihapus permanen.</p>
            <div className="mt-4 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowDelete(null)}>Batal</button>
              <button className="btn-danger flex-1" onClick={removePackage} disabled={submitting}>{submitting ? 'Menghapus...' : 'Hapus'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
