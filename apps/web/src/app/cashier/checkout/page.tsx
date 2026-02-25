'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { billingApi, ordersApi, paymentsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const paymentIdParam = searchParams.get('paymentId');

  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [discountAmt, setDiscountAmt] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [reference, setReference] = useState('');
  const [currentPayment, setCurrentPayment] = useState<any>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [sessions, orders, payments] = await Promise.all([
        billingApi.getActiveSessions(),
        ordersApi.list({ status: 'DRAFT', limit: 50 }),
        paymentsApi.list({ status: 'PENDING_PAYMENT', limit: 50 }),
      ]);
      setActiveSessions(sessions);
      setPendingOrders(orders.data || []);
      setPendingPayments(payments.data || []);
      if (paymentIdParam) {
        const p = (payments.data || []).find((x: any) => x.id === paymentIdParam);
        if (p) setCurrentPayment(p);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [paymentIdParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedSessionData = activeSessions.find((s) => s.id === selectedSession);
  const selectedOrdersData = pendingOrders.filter((o) => selectedOrders.includes(o.id));
  const billingAmt = selectedSessionData ? parseFloat(selectedSessionData.totalAmount) : 0;
  const fnbAmt = selectedOrdersData.reduce((s, o) => s + parseFloat(o.subtotal || '0'), 0);
  const taxAmt = selectedOrdersData.reduce((s, o) => s + parseFloat(o.taxAmount || '0'), 0);
  const subtotal = billingAmt + fnbAmt;
  const total = subtotal + taxAmt - discountAmt;
  const change = parseFloat(amountPaid || '0') - total;

  const createCheckout = async () => {
    if (!selectedSession && selectedOrders.length === 0) {
      toast.error('Pilih sesi atau order terlebih dahulu');
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
      });
      setCurrentPayment(payment);
      toast.success('Checkout dibuat! Konfirmasi pembayaran.');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal membuat checkout');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPayment = async () => {
    if (!currentPayment) return;
    const paid = parseFloat(amountPaid);
    if (isNaN(paid) || paid < parseFloat(currentPayment.totalAmount)) {
      toast.error('Jumlah uang kurang dari total atau tidak valid');
      return;
    }
    setSubmitting(true);
    try {
      const result = await paymentsApi.confirmPayment(currentPayment.id, paid);
      setReceipt(result.receipt);
      setCurrentPayment(result.payment);
      toast.success('✅ Pembayaran dikonfirmasi!');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal konfirmasi');
    } finally {
      setSubmitting(false);
    }
  };

  const markPrinted = async () => {
    if (!currentPayment) return;
    try {
      await paymentsApi.markPrinted(currentPayment.id);
      toast.success('Tanda terima ditandai sudah dicetak');
      setCurrentPayment({ ...currentPayment, isPrinted: true });
    } catch (e: any) {
      toast.error('Gagal');
    }
  };

  const reset = () => {
    setCurrentPayment(null);
    setReceipt(null);
    setAmountPaid('');
    setSelectedSession('');
    setSelectedOrders([]);
    setDiscountAmt(0);
    setDiscountReason('');
    setReference('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Receipt view
  if (receipt && currentPayment?.status === 'PAID') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="card">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">🧾</div>
            <h2 className="text-xl font-bold">Struk Pembayaran</h2>
            <p className="text-green-400 font-medium">LUNAS</p>
          </div>

          <div className="border-t border-dashed border-slate-600 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">No. Pembayaran</span>
              <span className="font-mono text-xs">{receipt.paymentNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Kasir</span>
              <span>{receipt.cashier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Meja</span>
              <span>{receipt.table}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Waktu</span>
              <span>{formatDate(receipt.paidAt)}</span>
            </div>
          </div>

          {receipt.billingSession && (
            <div className="border-t border-dashed border-slate-600 py-3">
              <p className="text-slate-400 text-xs mb-2 uppercase tracking-wide">Sesi Billiard</p>
              <div className="flex justify-between text-sm">
                <span>Billiard ({receipt.billingSession.duration}m)</span>
                <span>{formatCurrency(receipt.billingAmount)}</span>
              </div>
            </div>
          )}

          {receipt.fnbItems?.length > 0 && (
            <div className="border-t border-dashed border-slate-600 py-3">
              <p className="text-slate-400 text-xs mb-2 uppercase tracking-wide">F&B</p>
              {receipt.fnbItems.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm mb-1">
                  <span>{item.name} x{item.qty}</span>
                  <span>{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-dashed border-slate-600 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Subtotal</span>
              <span>{formatCurrency(receipt.subtotal)}</span>
            </div>
            {parseFloat(receipt.discount) > 0 && (
              <div className="flex justify-between text-red-400">
                <span>Diskon</span>
                <span>- {formatCurrency(receipt.discount)}</span>
              </div>
            )}
            {parseFloat(receipt.tax) > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Pajak</span>
                <span>{formatCurrency(receipt.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-slate-600 pt-2 mt-2">
              <span>TOTAL</span>
              <span className="text-green-400">{formatCurrency(receipt.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Dibayar ({receipt.method})</span>
              <span>{formatCurrency(receipt.amountPaid)}</span>
            </div>
            {parseFloat(receipt.change || '0') > 0 && (
              <div className="flex justify-between font-bold">
                <span>Kembalian</span>
                <span className="text-blue-400">{formatCurrency(receipt.change)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            {!currentPayment.isPrinted && (
              <button onClick={markPrinted} className="btn-primary flex-1">
                🖨 Tandai Tercetak
              </button>
            )}
            <button onClick={reset} className="btn-secondary flex-1">
              Transaksi Baru
            </button>
          </div>

          {currentPayment.isPrinted && (
            <p className="text-center text-xs text-slate-400 mt-2">✓ Sudah dicetak</p>
          )}
        </div>
      </div>
    );
  }

  // Payment confirmation view
  if (currentPayment && currentPayment.status === 'PENDING_PAYMENT') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-6">Konfirmasi Pembayaran</h1>

        <div className="card mb-4">
          <h3 className="font-semibold mb-3">Ringkasan</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">No. Pembayaran</span>
              <span className="font-mono">{currentPayment.paymentNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Billiard</span>
              <span>{formatCurrency(currentPayment.billingAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">F&B</span>
              <span>{formatCurrency(currentPayment.fnbAmount)}</span>
            </div>
            {parseFloat(currentPayment.discountAmount) > 0 && (
              <div className="flex justify-between text-red-400">
                <span>Diskon</span>
                <span>- {formatCurrency(currentPayment.discountAmount)}</span>
              </div>
            )}
            {parseFloat(currentPayment.taxAmount) > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Pajak</span>
                <span>{formatCurrency(currentPayment.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-slate-600 pt-2">
              <span>TOTAL</span>
              <span className="text-green-400">{formatCurrency(currentPayment.totalAmount)}</span>
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <label className="label">Uang Diterima (Rp)</label>
          <input
            type="number"
            className="input text-lg mb-2"
            placeholder="0"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
          {/* Quick amounts */}
          <div className="flex gap-2 flex-wrap">
            {[
              parseFloat(currentPayment.totalAmount),
              50000, 100000, 150000, 200000, 500000
            ].map((amt) => (
              <button
                key={amt}
                onClick={() => setAmountPaid(String(amt))}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
              >
                {formatCurrency(amt)}
              </button>
            ))}
          </div>
          {parseFloat(amountPaid) > 0 && (
            <div className="mt-3 p-2 bg-slate-700 rounded-lg flex justify-between">
              <span className="text-slate-400">Kembalian</span>
              <span className={`font-bold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(Math.max(0, change))}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={reset} className="btn-secondary">Batal</button>
          <button
            onClick={confirmPayment}
            disabled={submitting || !amountPaid || parseFloat(amountPaid) < parseFloat(currentPayment.totalAmount)}
            className="btn-success flex-1 text-base py-3"
          >
            {submitting ? 'Memproses...' : '💰 Uang Diterima'}
          </button>
        </div>
      </div>
    );
  }

  // Create checkout view
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {/* Pending Payments */}
      {pendingPayments.length > 0 && (
        <div className="card border-yellow-500/30">
          <h3 className="font-semibold text-yellow-400 mb-3">⏳ Menunggu Konfirmasi</h3>
          {pendingPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-2 bg-slate-700 rounded-lg mb-2">
              <div>
                <p className="text-sm font-medium">{p.paymentNumber}</p>
                <p className="text-xs text-slate-400">{p.method} • {formatCurrency(p.totalAmount)}</p>
              </div>
              <button onClick={() => setCurrentPayment(p)} className="btn-primary text-xs py-1 px-3">
                Konfirmasi
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create New Checkout */}
      <div className="card">
        <h3 className="font-semibold mb-4">Buat Checkout Baru</h3>

        {/* Select Session */}
        <div className="mb-4">
          <label className="label">Sesi Billiard</label>
          <select className="input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            <option value="">— Tanpa Billiard —</option>
            {activeSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.table?.name} — {formatCurrency(s.totalAmount)}
              </option>
            ))}
          </select>
          {selectedSessionData && (
            <p className="text-sm text-green-400 mt-1">
              Biaya Billiard: {formatCurrency(selectedSessionData.totalAmount)}
            </p>
          )}
        </div>

        {/* Select Orders */}
        {pendingOrders.length > 0 && (
          <div className="mb-4">
            <label className="label">Pesanan F&B (pilih yang ingin digabung)</label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {pendingOrders.map((o) => (
                <label key={o.id} className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(o.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedOrders([...selectedOrders, o.id]);
                      else setSelectedOrders(selectedOrders.filter((id) => id !== o.id));
                    }}
                    className="rounded"
                  />
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{o.orderNumber}</p>
                    <p className="text-slate-400">{o.items?.length || 0} item • {formatCurrency(o.total)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div className="mb-4">
          <label className="label">Metode Pembayaran</label>
          <div className="flex gap-2">
            {(['CASH', 'QRIS', 'TRANSFER'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${method === m ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {(method === 'QRIS' || method === 'TRANSFER') && (
          <div className="mb-4">
            <label className="label">Referensi Pembayaran</label>
            <input
              type="text"
              className="input"
              placeholder="Nomor referensi/TF"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        )}

        {/* Discount */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Diskon (Rp)</label>
            <input
              type="number"
              className="input"
              placeholder="0"
              value={discountAmt || ''}
              onChange={(e) => setDiscountAmt(parseFloat(e.target.value) || 0)}
              min={0}
            />
          </div>
          <div>
            <label className="label">Alasan Diskon</label>
            <input
              type="text"
              className="input"
              placeholder="Member, promo, dll"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="p-3 bg-slate-700 rounded-lg mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Billiard</span>
            <span>{formatCurrency(billingAmt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">F&B</span>
            <span>{formatCurrency(fnbAmt)}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-red-400">
              <span>Diskon</span>
              <span>- {formatCurrency(discountAmt)}</span>
            </div>
          )}
          {taxAmt > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Pajak</span>
              <span>{formatCurrency(taxAmt)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-slate-600 pt-2 mt-2">
            <span>TOTAL</span>
            <span className="text-green-400">{formatCurrency(total)}</span>
          </div>
        </div>

        <button
          onClick={createCheckout}
          disabled={submitting || (total <= 0)}
          className="btn-primary w-full py-3 text-base"
        >
          {submitting ? 'Memproses...' : 'Buat Checkout →'}
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>}>
      <CheckoutContent />
    </Suspense>
  );
}
