'use client';

import { useEffect, useState } from 'react';
import { financeApi } from '@/lib/api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function FinancePage() {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expCategory, setExpCategory] = useState('');
  const [expDate, setExpDate] = useState(today);
  const [expAmount, setExpAmount] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await financeApi.getReport(
        new Date(startDate + 'T00:00:00').toISOString(),
        new Date(endDate + 'T23:59:59').toISOString(),
      );
      setReport(data);
      setExpenses(data.expenses?.items || []);
    } catch (e) {
      toast.error('Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const setPreset = (preset: string) => {
    const now = new Date();
    let start: Date, end: Date;
    if (preset === 'today') {
      start = end = now;
    } else if (preset === 'week') {
      end = now;
      start = new Date(now); start.setDate(now.getDate() - 7);
    } else if (preset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
    } else {
      return;
    }
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const submitExpense = async () => {
    if (!expCategory || !expAmount) { toast.error('Isi kategori dan jumlah'); return; }
    setSubmitting(true);
    try {
      await financeApi.createExpense({
        category: expCategory,
        date: expDate,
        amount: parseFloat(expAmount),
        notes: expNotes,
      });
      toast.success('Pengeluaran ditambahkan');
      setShowExpenseForm(false);
      setExpCategory('');
      setExpAmount('');
      setExpNotes('');
      fetchReport();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Laporan Keuangan</h1>
        <button onClick={() => setShowExpenseForm(!showExpenseForm)} className="btn-secondary">
          + Tambah Pengeluaran
        </button>
      </div>

      {/* Expense Form */}
      {showExpenseForm && (
        <div className="card border-blue-500/30">
          <h3 className="font-semibold mb-4">Form Pengeluaran</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Kategori</label>
              <input className="input" placeholder="Operasional, Gaji, dll" value={expCategory} onChange={(e) => setExpCategory(e.target.value)} />
            </div>
            <div>
              <label className="label">Tanggal</label>
              <input type="date" className="input" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Jumlah (Rp)</label>
              <input type="number" className="input" placeholder="0" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Catatan</label>
              <input className="input" placeholder="Keterangan..." value={expNotes} onChange={(e) => setExpNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowExpenseForm(false)} className="btn-secondary">Batal</button>
            <button onClick={submitExpense} className="btn-primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {/* Date Filter */}
      <div className="card">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-2">
            {['today', 'week', 'month'].map((p) => (
              <button key={p} onClick={() => setPreset(p)} className="btn-secondary text-sm py-1.5 px-3 capitalize">
                {p === 'today' ? 'Hari Ini' : p === 'week' ? '7 Hari' : 'Bulan Ini'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" className="input text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="text-slate-400">s/d</span>
            <input type="date" className="input text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button onClick={fetchReport} className="btn-primary text-sm py-2 px-4" disabled={loading}>
              {loading ? '...' : 'Tampilkan'}
            </button>
          </div>
        </div>
      </div>

      {/* Report Summary */}
      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-slate-400 text-sm">Total Pendapatan</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(report.revenue.total)}</p>
            </div>
            <div className="card">
              <p className="text-slate-400 text-sm">Billiard</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">{formatCurrency(report.revenue.billiard)}</p>
            </div>
            <div className="card">
              <p className="text-slate-400 text-sm">F&B</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">{formatCurrency(report.revenue.fnb)}</p>
            </div>
            <div className="card">
              <p className="text-slate-400 text-sm">Pengeluaran</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{formatCurrency(report.expenses.total)}</p>
            </div>
          </div>

          <div className="card border-green-500/30">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-slate-400">Profit Bersih</p>
                <p className={`text-3xl font-bold mt-1 ${parseFloat(report.netProfit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(report.netProfit)}
                </p>
              </div>
              <div className="text-right">
                {report.paymentMethods.map((p: any) => (
                  <div key={p.method} className="text-sm text-slate-400">
                    {p.method}: {formatCurrency(p.total)} ({p.count}x)
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Per Table */}
          {report.perTable.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">Pendapatan Per Meja</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Meja</th>
                      <th>Jumlah Sesi</th>
                      <th>Pendapatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perTable.sort((a: any, b: any) => parseFloat(b.revenue) - parseFloat(a.revenue)).map((t: any) => (
                      <tr key={t.tableId}>
                        <td className="font-medium">{t.tableName}</td>
                        <td>{t.sessions} sesi</td>
                        <td className="font-bold text-green-400">{formatCurrency(t.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expenses */}
          {expenses.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">Daftar Pengeluaran</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Kategori</th>
                      <th>Jumlah</th>
                      <th>Catatan</th>
                      <th>Dibuat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e: any) => (
                      <tr key={e.id}>
                        <td>{formatDateShort(e.date)}</td>
                        <td><span className="badge bg-slate-700 text-slate-300">{e.category}</span></td>
                        <td className="font-medium text-red-400">{formatCurrency(e.amount)}</td>
                        <td className="text-slate-400 text-sm">{e.notes || '-'}</td>
                        <td className="text-slate-400 text-sm">{e.createdBy?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
