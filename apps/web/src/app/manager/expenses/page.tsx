'use client';

import { useEffect, useState } from 'react';
import { financeApi } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

  const today = new Date().toISOString().split('T')[0];
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const [data, categories] = await Promise.all([
        financeApi.listExpenses({
          startDate: filterStart ? new Date(filterStart + 'T00:00:00').toISOString() : undefined,
          endDate: filterEnd ? new Date(filterEnd + 'T23:59:59').toISOString() : undefined,
          limit: 100,
        }),
        financeApi.expenseCategories(),
      ]);
      setExpenses(data.data || []);
      setExpenseCategories(categories || []);
      setTotal(data.data?.reduce((s: number, e: any) => s + parseFloat(e.amount), 0) || 0);
    } catch {
      toast.error('Gagal memuat pengeluaran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExpenses(); }, []);

  const submit = async () => {
    if (!category || !amount) { toast.error('Kategori dan jumlah wajib diisi'); return; }
    if (category === 'Lainnya' && !notes.trim()) { toast.error('Catatan wajib diisi untuk kategori Lainnya'); return; }
    setSubmitting(true);
    try {
      await financeApi.createExpense({ category, date, amount: parseFloat(amount), notes });
      toast.success('Pengeluaran ditambahkan');
      setShowForm(false);
      setCategory(''); setAmount(''); setNotes(''); setDate(today);
      fetchExpenses();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pengeluaran</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Tambah Pengeluaran</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Tambah Pengeluaran</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Kategori *</label>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Pilih kategori</option>
                  {expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="label">Tanggal *</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><label className="label">Jumlah (Rp) *</label><input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500000" /></div>
              <div><label className="label">Catatan {category === 'Lainnya' ? '*' : ''}</label><textarea className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan..." /></div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <input type="date" className="input w-44" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
        <span className="text-slate-500">s/d</span>
        <input type="date" className="input w-44" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
        <button onClick={fetchExpenses} className="btn-secondary text-sm py-2 px-4">Filter</button>
      </div>

      <div className="card"><div className="flex justify-between items-center"><span className="text-slate-500">Total Pengeluaran</span><span className="text-2xl font-bold text-red-600">{formatCurrency(total)}</span></div></div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Tanggal</th><th>Kategori</th><th>Jumlah</th><th>Catatan</th><th>Dibuat Oleh</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="text-center py-8 text-slate-500">Memuat...</td></tr> : expenses.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-500">Belum ada pengeluaran</td></tr> : expenses.map((e) => (
                <tr key={e.id}><td>{formatDateShort(e.date)}</td><td><span className="badge bg-slate-100 text-slate-700">{e.category}</span></td><td className="font-bold text-red-600">{formatCurrency(e.amount)}</td><td className="text-slate-500 text-sm">{e.notes || '-'}</td><td className="text-slate-500 text-sm">{e.createdBy?.name}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
