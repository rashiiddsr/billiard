'use client';

import { useEffect, useMemo, useState } from 'react';
import { financeApi, paymentsApi, usersApi } from '@/lib/api';
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
  const [activeShortcut, setActiveShortcut] = useState<'today' | 'last7' | 'last30' | 'month' | null>('month');
  const [report, setReport] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [paidById, setPaidById] = useState('');
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [detail, setDetail] = useState<any>(null);

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

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const data = await paymentsApi.list({
        status: 'PAID',
        paidById: paidById || undefined,
        startDate: new Date(`${startDate}T00:00:00`).toISOString(),
        endDate: new Date(`${endDate}T23:59:59`).toISOString(),
        limit: 300,
      });
      setPayments(data.data || []);
    } catch {
      toast.error('Gagal memuat daftar transaksi');
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    usersApi.list().then((u) => setUsers((u || []).filter((x: any) => x.role === 'CASHIER'))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchReport();
    fetchExpenses();
  }, [startDate, endDate]);

  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchPayments();
  }, [startDate, endDate, paidById]);

  const applyShortcut = (type: 'today' | 'last7' | 'last30' | 'month') => {
    const now = new Date();
    const end = toDateInputValue(now);
    setActiveShortcut(type);

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

  const downloadCsv = () => {
    if (!report) return;
    const rows = [
      ['Mulai', startDate],
      ['Selesai', endDate],
      ['Total Pendapatan', report.revenue.total],
      ['Pendapatan Billiard', report.revenue.billiard],
      ['Pendapatan FNB', report.revenue.fnb],
      ['Total Pengeluaran', report.expenses.total],
      ['Profit Bersih', report.netProfit],
    ];
    const csv = ['Metrik,Nilai', ...rows.map((r) => `${r[0]},${r[1]}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-keuangan-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPayments = useMemo(() => payments.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [payments]);
  const getShortcutClassName = (type: 'today' | 'last7' | 'last30' | 'month') =>
    `text-xs px-3 py-1.5 rounded ${activeShortcut === type ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Laporan & Transaksi Owner</h1>
        <button className="btn-secondary" onClick={downloadCsv}>Download CSV</button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal</label>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => { setActiveShortcut(null); setStartDate(e.target.value); }} />
          <span className="text-slate-500 text-center">s/d</span>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => { setActiveShortcut(null); setEndDate(e.target.value); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className={getShortcutClassName('today')}>Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className={getShortcutClassName('last7')}>7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className={getShortcutClassName('last30')}>30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className={getShortcutClassName('month')}>Bulan ini</button>
        </div>
      </div>

      {report && !loadingReport && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card"><p className="text-sm text-slate-500">Total Pendapatan</p><p className="mt-1 text-2xl font-bold text-emerald-600">{formatCurrency(report.revenue.total)}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Billiard</p><p className="mt-1 text-2xl font-bold text-blue-600">{formatCurrency(report.revenue.billiard)}</p></div>
            <div className="card"><p className="text-sm text-slate-500">F&B</p><p className="mt-1 text-2xl font-bold text-purple-600">{formatCurrency(report.revenue.fnb)}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Pengeluaran</p><p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(report.expenses.total)}</p></div>
          </div>

          <div className="card border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500">Profit Bersih</p>
                <p className={`mt-1 text-3xl font-bold ${parseFloat(report.netProfit) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(report.netProfit)}</p>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Daftar Transaksi</h2>
          <p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(totalPayments)}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">Kasir</label>
          <select className="input w-full md:w-72" value={paidById} onChange={(e) => setPaidById(e.target.value)}>
            <option value="">Semua kasir</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Kasir</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{loadingPayments ? <tr><td colSpan={5} className="py-8 text-center text-slate-500">Memuat...</td></tr> : payments.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{x.paidBy?.name || '-'}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td><button onClick={async () => setDetail(await paymentsApi.getReceipt(x.id))} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</button></td></tr>)}</tbody></table></div></div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Daftar Pengeluaran (Readonly Owner)</h2>
        <div className="card p-0 overflow-hidden">
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Tanggal</th><th>Kategori</th><th>Jumlah</th><th>Catatan</th><th>Dibuat Oleh</th></tr></thead>
              <tbody>
                {loadingExpenses ? <tr><td colSpan={5} className="text-center py-8 text-slate-500">Memuat...</td></tr> : expenses.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-500">Belum ada pengeluaran</td></tr> : expenses.map((e) => (
                  <tr key={e.id}><td>{formatDateShort(e.date)}</td><td><span className="badge bg-slate-100 text-slate-700">{e.category}</span></td><td className="font-bold text-red-600">{formatCurrency(e.amount)}</td><td className="text-sm text-slate-500">{e.notes || '-'}</td><td className="text-sm text-slate-500">{e.createdBy?.name || '-'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Detail Transaksi {detail.paymentNumber}</h3><button onClick={() => setDetail(null)}>✕</button></div>
            <div className="space-y-1 text-sm">
              {(detail.billingSession?.amount || 0) > 0 && (
                <>
                  <div className="flex justify-between"><span>Billiard awal</span><span>{formatCurrency(detail.billingSession?.breakdown?.baseAmount || 0)}</span></div>
                  {(detail.billingSession?.breakdown?.extensions || []).map((x: any, i: number) => <div key={x.id || i} className="flex justify-between text-slate-600"><span>Perpanjangan #{i + 1} (+{x.additionalMinutes} menit)</span><span>{formatCurrency(x.additionalAmount)}</span></div>)}
                  <div className="flex justify-between"><span>Total Billiard</span><span>{formatCurrency(detail.billingSession?.amount || 0)}</span></div>
                </>
              )}
              <div className="mt-2 border-t pt-2"><p className="font-semibold">F&B</p>{(detail.fnbItems || []).length === 0 ? <p className="text-slate-500">Tidak ada F&B</p> : detail.fnbItems.map((f: any, i: number) => <div key={i} className="flex justify-between"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}</div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total Transaksi</span><span>{formatCurrency(detail.total)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
