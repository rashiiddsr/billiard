'use client';

import { useEffect, useMemo, useState } from 'react';
import { financeApi } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

function toDateInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

  const today = useMemo(() => toDateInputValue(new Date()), []);
  const monthStart = useMemo(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const [category, setCategory] = useState('');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [filterStart, setFilterStart] = useState(monthStart);
  const [filterEnd, setFilterEnd] = useState(today);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const [data, categories] = await Promise.all([
        financeApi.listExpenses({
          startDate: new Date(`${filterStart}T00:00:00`).toISOString(),
          endDate: new Date(`${filterEnd}T23:59:59`).toISOString(),
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

  useEffect(() => {
    if (!filterStart || !filterEnd) return;
    fetchExpenses();
  }, [filterStart, filterEnd]);

  const openCreate = () => {
    setEditingExpense(null);
    setCategory('');
    setDate(today);
    setAmount('');
    setNotes('');
    setShowForm(true);
  };

  const openEdit = (expense: any) => {
    setEditingExpense(expense);
    setCategory(expense.category);
    setDate(toDateInputValue(new Date(expense.date)));
    setAmount(String(Number(expense.amount)));
    setNotes(expense.notes || '');
    setShowForm(true);
  };

  const submit = async () => {
    if (!category || !amount) { toast.error('Kategori dan jumlah wajib diisi'); return; }
    if (category === 'Lainnya' && !notes.trim()) { toast.error('Catatan wajib diisi untuk kategori Lainnya'); return; }
    setSubmitting(true);
    try {
      const payload = { category, date, amount: parseFloat(amount), notes };
      if (editingExpense) {
        await financeApi.updateExpense(editingExpense.id, payload);
        toast.success('Pengeluaran diperbarui');
      } else {
        await financeApi.createExpense(payload);
        toast.success('Pengeluaran ditambahkan');
      }
      setShowForm(false);
      setEditingExpense(null);
      setCategory(''); setAmount(''); setNotes(''); setDate(today);
      fetchExpenses();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };

  const applyShortcut = (type: 'today' | 'last7' | 'last30' | 'month') => {
    const now = new Date();
    const end = toDateInputValue(now);

    if (type === 'today') {
      setFilterStart(end);
      setFilterEnd(end);
      return;
    }

    if (type === 'last7') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setFilterStart(toDateInputValue(start));
      setFilterEnd(end);
      return;
    }

    if (type === 'last30') {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      setFilterStart(toDateInputValue(start));
      setFilterEnd(end);
      return;
    }

    setFilterStart(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
    setFilterEnd(end);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pengeluaran</h1>
        <button onClick={openCreate} className="btn-primary">+ Tambah Pengeluaran</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">{editingExpense ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Kategori <span className="text-red-500">*</span></label>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Pilih kategori</option>
                  {expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="label">Tanggal <span className="text-red-500">*</span></label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><label className="label">Jumlah (Rp) <span className="text-red-500">*</span></label><input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500000" /></div>
              <div><label className="label">Catatan {category === 'Lainnya' && <span className="text-red-500">*</span>}</label><textarea className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan..." /></div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal</label>
          <input type="date" className="input w-full" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
          <span className="text-slate-500 text-center">s/d</span>
          <input type="date" className="input w-full" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Bulan ini</button>
        </div>
      </div>

      <div className="card"><div className="flex justify-between items-center"><span className="text-slate-500">Total Pengeluaran</span><span className="text-2xl font-bold text-red-600">{formatCurrency(total)}</span></div></div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Tanggal</th><th>Kategori</th><th>Jumlah</th><th>Catatan</th><th>Dibuat Oleh</th><th>Aksi</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="text-center py-8 text-slate-500">Memuat...</td></tr> : expenses.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-slate-500">Belum ada pengeluaran</td></tr> : expenses.map((e) => (
                <tr key={e.id}><td>{formatDateShort(e.date)}</td><td><span className="badge bg-slate-100 text-slate-700">{e.category}</span></td><td className="font-bold text-red-600">{formatCurrency(e.amount)}</td><td className="text-slate-500 text-sm">{e.notes || '-'}</td><td className="text-slate-500 text-sm">{e.createdBy?.name}</td><td><button onClick={() => openEdit(e)} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">Edit</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
