'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { billingApi, ordersApi, paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER';

export default function CheckoutPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [standaloneOrders, setStandaloneOrders] = useState<any[]>([]);
  const [sessionOrders, setSessionOrders] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [discountAmt, setDiscountAmt] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [reference, setReference] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [active, completed, draftOrders] = await Promise.all([
        billingApi.getActiveSessions(),
        billingApi.getSessions({ status: 'COMPLETED', limit: 100 }),
        ordersApi.list({ status: 'DRAFT', limit: 200 }),
      ]);

      const completedUnpaid = (completed.data || []).filter((s: any) => (s.payments || []).length === 0);
      const mergedSessions = [...active, ...completedUnpaid].filter((s: any) => s.rateType !== 'OWNER_LOCK');
      setSessions(mergedSessions);

      const allDraft = draftOrders.data || [];
      setStandaloneOrders(allDraft.filter((o: any) => !o.billingSessionId));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const loadSessionOrders = async () => {
      if (!selectedSession) {
        setSessionOrders([]);
        return;
      }
      const data = await ordersApi.list({ billingSessionId: selectedSession, status: 'DRAFT', limit: 200 });
      const orders = data.data || [];
      setSessionOrders(orders);
      setSelectedOrders(orders.map((o: any) => o.id));
    };
    loadSessionOrders().catch(() => setSessionOrders([]));
  }, [selectedSession]);

  const selectedSessionData = sessions.find((s) => s.id === selectedSession);
  const selectableOrders = selectedSession ? sessionOrders : standaloneOrders;
  const selectedOrdersData = selectableOrders.filter((o: any) => selectedOrders.includes(o.id));
  const billingAmt = selectedSessionData ? parseFloat(selectedSessionData.totalAmount) : 0;
  const fnbAmt = selectedOrdersData.reduce((s: number, o: any) => s + parseFloat(o.subtotal || '0'), 0);
  const taxAmt = selectedOrdersData.reduce((s: number, o: any) => s + parseFloat(o.taxAmount || '0'), 0);

  const breakdown = useMemo(() => {
    const extLogs = selectedSessionData?.billingBreakdown?.extensions || [];
    return {
      baseAmount: Number(selectedSessionData?.billingBreakdown?.baseAmount || Math.max(0, billingAmt - Number(selectedSessionData?.billingBreakdown?.extensionTotal || 0))),
      extensions: extLogs,
      extensionTotal: Number(selectedSessionData?.billingBreakdown?.extensionTotal || 0),
    };
  }, [selectedSessionData, billingAmt]);

  const subtotal = billingAmt + fnbAmt;
  const total = subtotal + taxAmt - discountAmt;

  const createCheckout = async () => {
    if (!selectedSession && selectedOrders.length === 0) {
      toast.error('Pilih sesi atau order terlebih dahulu');
      return;
    }
    const paid = parseFloat(amountPaid || '0');
    if (paid < total) {
      toast.error('Uang diterima kurang dari total');
      return;
    }

    setSubmitting(true);
    try {
      const payment = await paymentsApi.createCheckout({
        billingSessionId: selectedSession || undefined,
        orderIds: selectedOrders.length > 0 ? selectedOrders : undefined,
        method,
        discountAmount: discountAmt || undefined,
        discountReason: discountReason || undefined,
        reference: reference || undefined,
        amountPaid: paid,
      });
      toast.success(`Pembayaran selesai • ${payment.paymentNumber}`);
      setSelectedSession('');
      setSelectedOrders([]);
      setDiscountAmt(0);
      setDiscountReason('');
      setReference('');
      setAmountPaid('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal checkout');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <div className="card">
        <h3 className="mb-4 font-semibold">Checkout Transaksi Bundling</h3>

        <div className="mb-4">
          <label className="label">Pilih Sesi Meja (Aktif / Selesai Belum Dibayar)</label>
          <select className="input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            <option value="">— Standalone (tanpa sesi meja) —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.table?.name} • {s.status} • {formatCurrency(s.totalAmount)}</option>
            ))}
          </select>
        </div>

        {selectedSession ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="mb-2 font-semibold">Rincian Tagihan Meja</p>
            <div className="flex justify-between"><span>Billing awal</span><span>{formatCurrency(breakdown.baseAmount)}</span></div>
            {breakdown.extensions.map((item: any, idx: number) => (
              <div key={item.id || idx} className="flex justify-between text-slate-600"><span>Perpanjangan #{idx + 1} (+{item.additionalMinutes} menit)</span><span>{formatCurrency(item.additionalAmount)}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span>Total billiard</span><span className="font-semibold">{formatCurrency(billingAmt)}</span></div>
          </div>
        ) : null}

        {selectableOrders.length > 0 && (
          <div className="mb-4">
            <label className="label">Pesanan F&B {selectedSession ? '(otomatis terikat sesi)' : '(standalone)'}</label>
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {selectableOrders.map((o: any) => (
                <label key={o.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(o.id)}
                    onChange={(e) => {
                      if (selectedSession) return;
                      if (e.target.checked) setSelectedOrders([...selectedOrders, o.id]);
                      else setSelectedOrders(selectedOrders.filter((id) => id !== o.id));
                    }}
                    disabled={!!selectedSession}
                    className="rounded"
                  />
                  <div className="flex-1 text-sm"><p className="font-medium">{o.orderNumber}</p><p className="text-slate-500">{formatCurrency(o.total)}</p></div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex gap-2">{(['CASH', 'QRIS', 'TRANSFER'] as PaymentMethod[]).map((m) => <button key={m} onClick={() => setMethod(m)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${method === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{m}</button>)}</div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <input type="number" className="input" placeholder="Diskon (Rp)" value={discountAmt || ''} onChange={(e) => setDiscountAmt(parseFloat(e.target.value) || 0)} min={0} />
          <input type="text" className="input" placeholder="Alasan diskon" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
        </div>

        {(method === 'QRIS' || method === 'TRANSFER') && <input type="text" className="input mb-4" placeholder="Referensi pembayaran" value={reference} onChange={(e) => setReference(e.target.value)} />}
        <input type="number" className="input mb-4" placeholder="Uang diterima" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />

        <div className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Billiard</span><span>{formatCurrency(billingAmt)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">F&B</span><span>{formatCurrency(fnbAmt)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Pajak</span><span>{formatCurrency(taxAmt)}</span></div>
          {discountAmt > 0 && <div className="flex justify-between text-red-500"><span>Diskon</span><span>-{formatCurrency(discountAmt)}</span></div>}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><span>TOTAL</span><span className="text-emerald-600">{formatCurrency(total)}</span></div>
        </div>

        <button onClick={createCheckout} disabled={submitting || total <= 0} className="btn-primary w-full py-3 text-base">{submitting ? 'Memproses...' : 'Konfirmasi Pembayaran'}</button>
      </div>
    </div>
  );
}
