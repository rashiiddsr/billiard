'use client';

import { useEffect, useMemo, useState } from 'react';
import { paymentsApi, usersApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

function toDateInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

export default function ManagerTransactionsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [activeShortcut, setActiveShortcut] = useState<'today' | 'last7' | 'last30' | 'month' | null>('today');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [users, setUsers] = useState<any[]>([]);
  const [paidById, setPaidById] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [voidModal, setVoidModal] = useState<{ paymentId: string; paymentNumber: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const fetchData = async () => {
    try {
      const r = await paymentsApi.list({
        status: 'PAID',
        paidById: paidById || undefined,
        startDate: new Date(`${startDate}T00:00:00`).toISOString(),
        endDate: new Date(`${endDate}T23:59:59`).toISOString(),
        limit: 300,
      });
      setData(r.data || []);
    } catch {
      toast.error('Gagal memuat daftar transaksi');
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, paidById]);

  useEffect(() => {
    usersApi
      .listCashiers()
      .then((u) => setUsers((u || []).filter((x: any) => x.role === 'CASHIER')))
      .catch(() => {
        toast.error('Gagal memuat daftar kasir');
      });
  }, []);

  const applyShortcut = (type: 'today' | 'last7' | 'last30' | 'month') => {
    const now = new Date();
    const end = toDateInputValue(now);
    if (type === 'today') {
      setActiveShortcut(type);
      setStartDate(end);
      setEndDate(end);
      return;
    }
    if (type === 'last7') {
      setActiveShortcut(type);
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    if (type === 'last30') {
      setActiveShortcut(type);
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    setActiveShortcut(type);
    setStartDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(end);
  };

  const getShortcutClassName = (type: 'today' | 'last7' | 'last30' | 'month') =>
    `rounded px-3 py-1.5 text-xs ${activeShortcut === type ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;

  const total = useMemo(() => data.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [data]);

  const submitVoidRequest = async () => {
    if (!voidModal) return;
    try {
      await paymentsApi.requestVoid(voidModal.paymentId, voidReason.trim() || undefined);
      toast.success('Pengajuan void terkirim ke owner');
      setVoidModal(null);
      setVoidReason('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal mengajukan void transaksi');
    }
  };

  const openDetail = async (id: string) => {
    try {
      setDetail(await paymentsApi.getReceipt(id));
    } catch {
      toast.error('Detail transaksi tidak dapat diakses');
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Daftar Transaksi</h1><p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p></div>

      <div className="card space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal</label>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => { setActiveShortcut(null); setStartDate(e.target.value); }} />
          <span className="text-center text-slate-500">s/d</span>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => { setActiveShortcut(null); setEndDate(e.target.value); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className={getShortcutClassName('today')}>Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className={getShortcutClassName('last7')}>7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className={getShortcutClassName('last30')}>30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className={getShortcutClassName('month')}>Bulan ini</button>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">Kasir</label>
          <select className="input w-full md:w-72" value={paidById} onChange={(e) => setPaidById(e.target.value)}>
            <option value="">Semua kasir</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Kasir</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{data.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{x.paidBy?.name || '-'}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td className="space-x-2"><button onClick={() => openDetail(x.id)} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</button><button onClick={() => setVoidModal({ paymentId: x.id, paymentNumber: x.paymentNumber })} className="rounded bg-red-100 px-2 py-1 text-xs text-red-600">Ajukan Void</button></td></tr>)}</tbody></table></div></div>

      {voidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Ajukan Void {voidModal.paymentNumber}</h3>
              <button onClick={() => setVoidModal(null)}>✕</button>
            </div>
            <p className="text-sm text-slate-500">Pengajuan void akan dikirim ke owner untuk approval.</p>
            <textarea
              className="input mt-3 min-h-24 w-full"
              placeholder="Alasan void (opsional)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setVoidModal(null)}>Batal</button>
              <button className="btn-primary" onClick={submitVoidRequest}>Kirim Pengajuan</button>
            </div>
          </div>
        </div>
      )}

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
