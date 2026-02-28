'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { billingApi, companyApi, ordersApi, paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { buildBusinessReceiptHtml, printReceiptHtml } from '@/lib/receiptPrinter';
import toast from 'react-hot-toast';

type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER';

export default function CheckoutPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionOrders, setSessionOrders] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<any>(null);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [currentReceipt, setCurrentReceipt] = useState<any>(null);
  const [currentReceiptPaymentId, setCurrentReceiptPaymentId] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [active, completed] = await Promise.all([
        billingApi.getActiveSessions(),
        billingApi.getSessions({ status: 'COMPLETED', limit: 100 }),
      ]);

      const completedUnpaid = (completed.data || []).filter((s: any) => (s.payments || []).length === 0);
      const mergedSessions = [...active, ...completedUnpaid].filter((s: any) => s.rateType !== 'OWNER_LOCK' && (s.payments || []).length === 0);
      setSessions(mergedSessions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    companyApi.getProfile().then(setCompanyProfile).catch(() => setCompanyProfile(null));
  }, []);

  useEffect(() => {
    const loadSessionOrders = async () => {
      if (!selectedSession) {
        setSessionOrders([]);
        setSelectedSessionDetail(null);
        return;
      }
      const detail = await billingApi.getSession(selectedSession);
      setSelectedSessionDetail(detail);
      const data = await ordersApi.list({ billingSessionId: selectedSession, status: 'DRAFT', limit: 200 });
      const orders = data.data || [];
      setSessionOrders(orders);
    };
    loadSessionOrders().catch(() => setSessionOrders([]));
  }, [selectedSession]);

  const selectedSessionData = sessions.find((s) => s.id === selectedSession);
  const selectedOrdersData = sessionOrders;
  const billingAmt = selectedSessionDetail ? parseFloat(selectedSessionDetail.totalAmount) : (selectedSessionData ? parseFloat(selectedSessionData.totalAmount) : 0);
  const fnbAmt = selectedOrdersData.reduce((s: number, o: any) => s + parseFloat(o.subtotal || '0'), 0);

  const breakdown = useMemo(() => {
    const extLogs = selectedSessionDetail?.billingBreakdown?.extensions || [];
    return {
      baseAmount: Number(selectedSessionDetail?.billingBreakdown?.baseAmount || Math.max(0, billingAmt - Number(selectedSessionDetail?.billingBreakdown?.extensionTotal || 0))),
      extensions: extLogs,
      extensionTotal: Number(selectedSessionDetail?.billingBreakdown?.extensionTotal || 0),
    };
  }, [selectedSessionDetail, billingAmt]);

  const subtotal = billingAmt + fnbAmt;
  const packageUsageRows = selectedSessionDetail?.packageUsages || [];
  const groupedPackageUsageRows = useMemo(() => {
    const grouped = new Map<string, any>();
    for (const usage of packageUsageRows) {
      const key = usage.packageName;
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += 1;
        existing.packagePrice += Number(usage.packagePrice || 0);
        existing.originalPrice += Number(usage.originalPrice || 0);
        existing.durationMinutes += Number(usage.durationMinutes || 0);
        existing.fnbItems.push(...(usage.billingPackage?.items || []).filter((x: any) => x.type === 'MENU_ITEM').map((x: any) => ({
          name: x.menuItem?.name || 'Menu',
          qty: x.quantity,
          subtotal: Number(x.unitPrice || 0) * Number(x.quantity || 0),
        })));
      } else {
        grouped.set(key, {
          ...usage,
          qty: 1,
          packagePrice: Number(usage.packagePrice || 0),
          originalPrice: Number(usage.originalPrice || 0),
          durationMinutes: Number(usage.durationMinutes || 0),
          fnbItems: (usage.billingPackage?.items || []).filter((x: any) => x.type === 'MENU_ITEM').map((x: any) => ({
            name: x.menuItem?.name || 'Menu',
            qty: x.quantity,
            subtotal: Number(x.unitPrice || 0) * Number(x.quantity || 0),
          })),
        });
      }
    }
    return Array.from(grouped.values());
  }, [packageUsageRows]);
  const packageDiscount = (selectedSessionDetail?.packageUsages || []).reduce((sum: number, usage: any) => {
    const original = Number(usage.originalPrice || 0);
    const packagePrice = Number(usage.packagePrice || 0);
    return sum + Math.max(0, original - packagePrice);
  }, 0);
  const total = Math.max(0, subtotal);
  const change = Math.max(0, (parseFloat(amountPaid || '0') || 0) - total);
  const quickCash = Array.from(new Set([
    Math.ceil(total / 1000) * 1000,
    Math.ceil(total / 5000) * 5000,
    Math.ceil(total / 10000) * 10000,
    50000,
    100000,
  ])).filter((x) => x >= total);

  const itemizedFnb = selectedOrdersData.flatMap((order: any) =>
    (order.items || []).map((item: any) => ({
      key: `${order.id}-${item.id}`,
      name: item.menuItem?.name || 'Menu',
      qty: item.quantity,
      subtotal: item.subtotal,
    })),
  );

  useEffect(() => {
    if (method === 'QRIS' || method === 'TRANSFER') {
      setAmountPaid(String(total));
    }
  }, [method, total]);

  const createCheckout = async () => {
    if (!selectedSession) {
      toast.error('Pilih tagihan terlebih dahulu');
      return;
    }
    if ((method === 'QRIS' || method === 'TRANSFER') && !reference.trim()) {
      toast.error('Referensi pembayaran wajib diisi');
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
        orderIds: sessionOrders.map((o: any) => o.id),
        method,
        reference: reference || undefined,
        amountPaid: paid,
      });
      const receipt = await paymentsApi.getReceipt(payment.id);
      setCurrentReceipt(receipt);
      setCurrentReceiptPaymentId(payment.id);
      toast.success(`Pembayaran selesai • ${payment.paymentNumber}`);
      setSelectedSession('');
      setReference('');
      setAmountPaid('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal checkout');
    } finally {
      setSubmitting(false);
    }
  };

  const printAndCloseReceipt = async () => {
    if (!currentReceipt) return;
    const paidAt = new Date(currentReceipt.paidAt).toLocaleString('id-ID');
    const packageRows = (currentReceipt.packageUsages || []).map((pkg: any) => {
      const discount = Math.max(0, Number(pkg.originalPrice || 0) - Number(pkg.packagePrice || 0));
      const fnbRows = (pkg.fnbItems || [])
        .map((x: any) => `<div class="row"><span>${x.name} × ${x.qty}</span><span>${formatCurrency(x.subtotal)}</span></div>`)
        .join('');
      return `<div><div class="bold">${pkg.packageName}${pkg.qty > 1 ? ` × ${pkg.qty}` : ''}</div>
        ${pkg.durationMinutes ? `<div class="row"><span>Billing ${pkg.durationMinutes} menit</span><span>${formatCurrency(pkg.billingEquivalent)}</span></div>` : ''}
        ${fnbRows}
        <div class="row"><span>Diskon</span><span>-${formatCurrency(discount)}</span></div>
        <div class="row bold"><span>Subtotal</span><span>${formatCurrency(pkg.packagePrice)}</span></div>
      </div>`;
    }).join('<div class="line"></div>');
    const fnbExtraRows = (currentReceipt.fnbItems || []).length > 0
      ? (currentReceipt.fnbItems || []).map((f: any) => `<div class="row"><span>${f.name} × ${f.qty}</span><span>${formatCurrency(f.subtotal)}</span></div>`).join('')
      : '<div class="muted">Tidak ada F&B tambahan</div>';

    const receiptHtml = buildBusinessReceiptHtml({
      title: `Struk ${currentReceipt.paymentNumber}`,
      company: companyProfile,
      bodyRows: `
        <div class="row"><span>No</span><span>${currentReceipt.paymentNumber}</span></div>
        <div class="row"><span>Kasir</span><span>${currentReceipt.cashier}</span></div>
        <div class="row"><span>Waktu</span><span>${paidAt}</span></div>
        ${currentReceipt.table !== 'Standalone' ? `<div class="row"><span>Meja</span><span>${currentReceipt.table}</span></div>` : ''}
        ${(currentReceipt.billingSession?.amount || 0) > 0 ? `<div class="line"></div><div class="row"><span>Billiard</span><span>${formatCurrency(currentReceipt.billingSession?.amount || 0)}</span></div>` : ''}
        ${(currentReceipt.packageUsages || []).length > 0 ? `<div class="line"></div><div class="bold">Rincian Paket</div>${packageRows}` : ''}
        <div class="line"></div><div class="bold">F&B Tambahan</div>${fnbExtraRows}
        <div class="line"></div>
        <div class="row bold"><span>TOTAL</span><span>${formatCurrency(currentReceipt.total)}</span></div>
        <div class="row"><span>Uang Diterima</span><span>${formatCurrency(currentReceipt.amountPaid || 0)}</span></div>
        <div class="row"><span>Kembalian</span><span>${formatCurrency(currentReceipt.change || 0)}</span></div>
      `,
    });
    const printed = printReceiptHtml(receiptHtml);
    if (!printed) toast.error('Popup print diblokir browser');
    if (currentReceiptPaymentId) {
      paymentsApi.markPrinted(currentReceiptPaymentId).catch(() => null);
    }
    setCurrentReceipt(null);
    setCurrentReceiptPaymentId(null);
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <div className="card">
        <h3 className="mb-4 font-semibold">Checkout Transaksi Bundling</h3>

        <div className="mb-4">
          <label className="label">Pilih Tagihan</label>
          <select className="input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            <option value="">— Pilih tagihan meja —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.table?.name} • {new Date(s.startTime).toLocaleString('id-ID')} • {s.status} • {formatCurrency(s.totalAmount)}</option>
            ))}
          </select>
        </div>

        {selectedSession ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="mb-2 font-semibold">Rincian Tagihan Meja</p>
            {(groupedPackageUsageRows || []).map((usage: any, idx: number) => (
              <div key={usage.id || idx} className="mb-2 rounded border border-blue-100 bg-blue-50 p-2">
                <p className="text-xs font-semibold text-blue-700">{usage.packageName}{usage.qty > 1 ? ` × ${usage.qty}` : ''}</p>
                {usage.durationMinutes ? <div className="flex justify-between text-slate-700"><span>Billing {usage.durationMinutes} menit</span><span>{formatCurrency((Number(selectedSessionDetail?.ratePerHour || 0) * Number(usage.durationMinutes || 0)) / 60)}</span></div> : null}
                {(usage.fnbItems || []).map((x: any, i: number) => <div key={`${usage.id || idx}-fnb-${i}`} className="flex justify-between text-slate-600"><span>{x.name} × {x.qty}</span><span>{formatCurrency(x.subtotal)}</span></div>)}
                <div className="flex justify-between text-slate-700"><span>Diskon</span><span>-{formatCurrency(Math.max(0, Number(usage.originalPrice || 0) - Number(usage.packagePrice || 0)))}</span></div>
                <div className="flex justify-between text-slate-900 font-semibold"><span>Subtotal</span><span>{formatCurrency(usage.packagePrice)}</span></div>
              </div>
            ))}
            <div className="flex justify-between"><span>Tagihan billing {selectedSessionDetail?.durationMinutes || 0} menit</span><span>{formatCurrency(breakdown.baseAmount)}</span></div>
            {breakdown.extensions.map((item: any, idx: number) => (
              <div key={item.id || idx} className="flex justify-between text-slate-600"><span>Perpanjangan #{idx + 1} (+{item.additionalMinutes} menit)</span><span>{formatCurrency(item.additionalAmount)}</span></div>
            ))}
            {itemizedFnb.map((item) => (
              <div key={item.key} className="flex justify-between text-slate-700"><span>{item.name} × {item.qty}</span><span>{formatCurrency(item.subtotal)}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span>Total</span><span className="font-semibold">{formatCurrency(total)}</span></div>
          </div>
        ) : null}

        <div className="mb-4 flex gap-2">{(['CASH', 'QRIS', 'TRANSFER'] as PaymentMethod[]).map((m) => <button key={m} onClick={() => setMethod(m)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${method === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{m}</button>)}</div>

        {(method === 'QRIS' || method === 'TRANSFER') && <input type="text" className="input mb-4" placeholder="Referensi pembayaran (wajib)" value={reference} onChange={(e) => setReference(e.target.value)} />}
        <input type="number" className="input mb-4" placeholder="Uang diterima" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} readOnly={method !== 'CASH'} />
        {method === 'CASH' && <div className="mb-3 flex flex-wrap gap-2">{quickCash.map((amt) => <button key={amt} onClick={() => setAmountPaid(String(amt))} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">{formatCurrency(amt)}</button>)}</div>}

        <div className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Billiard</span><span>{formatCurrency(billingAmt)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">F&B</span><span>{formatCurrency(fnbAmt)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Hemat Paket (info)</span><span>{formatCurrency(packageDiscount)}</span></div>
          {itemizedFnb.length > 0 && (
            <div className="mt-1 border-t border-slate-200 pt-1">
              <p className="font-semibold">Detail Item F&B</p>
              {itemizedFnb.map((item) => <div key={item.key} className="flex justify-between text-slate-600"><span>{item.name} × {item.qty}</span><span>{formatCurrency(item.subtotal)}</span></div>)}
            </div>
          )}
          <div className="flex justify-between text-slate-600"><span>Kembalian</span><span>{formatCurrency(change)}</span></div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><span>TOTAL</span><span className="text-emerald-600">{formatCurrency(total)}</span></div>
        </div>

        <button onClick={createCheckout} disabled={submitting || total <= 0} className="btn-primary w-full py-3 text-base">{submitting ? 'Memproses...' : 'Konfirmasi Pembayaran'}</button>
      </div>

      {currentReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4">
            <div className="mb-2 text-center"><h3 className="text-lg font-bold">🧾 Struk Pembayaran</h3><p className="text-xs text-slate-500">Status Cetak: Sudah tercetak</p></div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>No Transaksi</span><span className="font-mono text-xs">{currentReceipt.paymentNumber}</span></div>
              <div className="flex justify-between"><span>Kasir</span><span>{currentReceipt.cashier}</span></div>
              <div className="flex justify-between"><span>Waktu</span><span>{new Date(currentReceipt.paidAt).toLocaleString('id-ID')}</span></div>
              {currentReceipt.table !== 'Standalone' && <div className="flex justify-between"><span>Meja</span><span>{currentReceipt.table}</span></div>}
              {currentReceipt.billingSession?.amount > 0 && (
                <>
                  <div className="flex justify-between"><span>Billiard awal</span><span>{formatCurrency(currentReceipt.billingSession?.breakdown?.baseAmount || 0)}</span></div>
                  {(currentReceipt.billingSession?.breakdown?.extensions || []).map((x: any, i: number) => <div key={x.id || i} className="flex justify-between text-slate-600"><span>Perpanjangan #{i + 1}</span><span>{formatCurrency(x.additionalAmount)}</span></div>)}
                  <div className="flex justify-between"><span>Total Billiard</span><span>{formatCurrency(currentReceipt.billingSession?.amount || 0)}</span></div>
                </>
              )}
              {(currentReceipt.packageUsages || []).length > 0 && (
                <div className="border-t pt-2">
                  <p className="font-semibold">Rincian Paket</p>
                  {(currentReceipt.packageUsages || []).map((pkg: any, idx: number) => (
                    <div key={pkg.id || idx} className="mb-2 rounded bg-slate-50 p-2">
                      <div className="font-medium">{pkg.packageName}{pkg.qty > 1 ? ` × ${pkg.qty}` : ''}</div>
                      {pkg.durationMinutes ? <div className="flex justify-between text-slate-600"><span>Billing {pkg.durationMinutes} menit</span><span>{formatCurrency(pkg.billingEquivalent)}</span></div> : null}
                      {(pkg.fnbItems || []).map((x: any, i: number) => <div key={i} className="flex justify-between text-slate-600"><span>{x.name} × {x.qty}</span><span>{formatCurrency(x.subtotal)}</span></div>)}
                      <div className="flex justify-between text-slate-700"><span>Diskon</span><span>-{formatCurrency(Math.max(0, Number(pkg.originalPrice || 0) - Number(pkg.packagePrice || 0)))}</span></div>
                      <div className="flex justify-between font-semibold"><span>Subtotal</span><span>{formatCurrency(pkg.packagePrice)}</span></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t pt-2"><p className="font-semibold">F&B Tambahan</p>{(currentReceipt.fnbItems || []).length === 0 ? <p className="text-slate-500">Tidak ada F&B tambahan</p> : currentReceipt.fnbItems.map((f: any, i: number) => <div key={i} className="flex justify-between"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}</div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>TOTAL</span><span>{formatCurrency(currentReceipt.total)}</span></div>
              <div className="flex justify-between"><span>Uang Diterima</span><span>{formatCurrency(currentReceipt.amountPaid || 0)}</span></div>
              <div className="flex justify-between"><span>Kembalian</span><span>{formatCurrency(currentReceipt.change || 0)}</span></div>
            </div>
            <button className="btn-primary mt-4 w-full" onClick={printAndCloseReceipt}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
