'use client';

import { useEffect, useMemo, useState } from 'react';
import { financeApi } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

function toDateInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

export default function FinancePage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const monthStart = useMemo(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [expCategory, setExpCategory] = useState('');
  const [expDate, setExpDate] = useState(today);
  const [expAmount, setExpAmount] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openCreateExpense = () => {
    setEditingExpense(null);
    setExpCategory('');
    setExpDate(today);
    setExpAmount('');
    setExpNotes('');
    setShowExpenseForm(true);
  };

  const openEditExpense = (expense: any) => {
    setEditingExpense(expense);
    setExpCategory(expense.category);
    setExpDate(toDateInputValue(new Date(expense.date)));
    setExpAmount(String(Number(expense.amount)));
    setExpNotes(expense.notes || '');
    setShowExpenseForm(true);
  };

  const fetchReport = async () => {
    setLoadingReport(true);
    try {
      const data = await financeApi.getReport(
        new Date(`${startDate}T00:00:00`).toISOString(),
        new Date(`${endDate}T23:59:59`).toISOString(),
      );
      setReport(data);
    } catch {
      toast.error('Gagal memuat laporan');
    } finally {
      setLoadingReport(false);
    }
  };

  const fetchExpenses = async () => {
    setLoadingExpenses(true);
    try {
      const data = await financeApi.listExpenses({
        startDate: new Date(`${startDate}T00:00:00`).toISOString(),
        endDate: new Date(`${endDate}T23:59:59`).toISOString(),
        limit: 100,
      });
      setExpenses(data.data || []);
    } catch {
      toast.error('Gagal memuat daftar pengeluaran');
    } finally {
      setLoadingExpenses(false);
    }
  };

  useEffect(() => {
    financeApi.expenseCategories().then(setExpenseCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchReport();
    fetchExpenses();
  }, [startDate, endDate]);

  const submitExpense = async () => {
    if (!expCategory || !expAmount) { toast.error('Kategori dan jumlah wajib diisi'); return; }
    if (expCategory === 'Lainnya' && !expNotes.trim()) { toast.error('Catatan wajib untuk kategori Lainnya'); return; }
    setSubmitting(true);
    try {
      const payload = {
        category: expCategory,
        date: expDate,
        amount: parseFloat(expAmount),
        notes: expNotes,
      };
      if (editingExpense) {
        await financeApi.updateExpense(editingExpense.id, payload);
        toast.success('Pengeluaran diperbarui');
      } else {
        await financeApi.createExpense(payload);
        toast.success('Pengeluaran ditambahkan');
      }
      setShowExpenseForm(false);
      fetchReport();
      fetchExpenses();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };


  const deleteExpense = async (expense: any) => {
    if (!window.confirm(`Hapus pengeluaran ${expense.category} sebesar ${formatCurrency(expense.amount)}?`)) return;
    try {
      await financeApi.deleteExpense(expense.id);
      toast.success('Pengeluaran dihapus');
      fetchReport();
      fetchExpenses();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghapus pengeluaran');
    }
  };

  const applyShortcut = (type: 'today' | 'last7' | 'last30' | 'month') => {
    const now = new Date();
    const end = toDateInputValue(now);
    if (type === 'today') {
      setStartDate(end);
      setEndDate(end);
      return;
    }
    if (type === 'last7') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    if (type === 'last30') {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    setStartDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(end);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Laporan Keuangan</h1>
        <button onClick={openCreateExpense} className="btn-primary">+ Tambah Pengeluaran</button>
      </div>

      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">{editingExpense ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</h3>
              <button onClick={() => setShowExpenseForm(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Kategori <span className="text-red-500">*</span></label>
                <select className="input" value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                  <option value="">Pilih kategori</option>
                  {expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tanggal <span className="text-red-500">*</span></label>
                <input type="date" className="input" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Jumlah (Rp) <span className="text-red-500">*</span></label>
                <input type="number" className="input" placeholder="500000" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Catatan {expCategory === 'Lainnya' && <span className="text-red-500">*</span>}</label>
                <textarea className="input resize-none" rows={2} placeholder="Keterangan..." value={expNotes} onChange={(e) => setExpNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowExpenseForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submitExpense} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal</label>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="text-slate-500 text-center">s/d</span>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Bulan ini</button>
        </div>
      </div>

      {report && !loadingReport && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card"><p className="text-slate-500 text-sm">Total Pendapatan</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(report.revenue.total)}</p></div>
            <div className="card"><p className="text-slate-500 text-sm">Billiard</p><p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(report.revenue.billiard)}</p></div>
            <div className="card"><p className="text-slate-500 text-sm">F&B</p><p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(report.revenue.fnb)}</p></div>
            <div className="card"><p className="text-slate-500 text-sm">Pengeluaran</p><p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(report.expenses.total)}</p></div>
          </div>

          <div className="card border-green-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-slate-500">Profit Bersih</p>
                <p className={`text-3xl font-bold mt-1 ${parseFloat(report.netProfit) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(report.netProfit)}
                </p>
              </div>
              <div className="text-right">
                {report.paymentMethods.map((p: any) => (
                  <div key={p.method} className="text-sm text-slate-500">{p.method}: {formatCurrency(p.total)} ({p.count}x)</div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Jumlah</th>
                <th>Catatan</th>
                <th>Dibuat Oleh</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loadingExpenses ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Memuat...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Belum ada pengeluaran</td></tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateShort(e.date)}</td>
                    <td><span className="badge bg-slate-100 text-slate-700">{e.category}</span></td>
                    <td className="font-bold text-red-600">{formatCurrency(e.amount)}</td>
                    <td className="text-slate-500 text-sm">{e.notes || '-'}</td>
                    <td className="text-slate-500 text-sm">{e.createdBy?.name || '-'}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditExpense(e)} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">Edit</button>
                        <button onClick={() => deleteExpense(e)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
