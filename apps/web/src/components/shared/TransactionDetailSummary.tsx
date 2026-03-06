'use client';

import { formatCurrency } from '@/lib/utils';

export default function TransactionDetailSummary({ detail }: { detail: any }) {
  const billingDuration = Number(detail?.billingSession?.duration || 0);

  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between"><span>No Transaksi</span><span className="font-mono text-xs">{detail.paymentNumber}</span></div>
      <div className="flex justify-between"><span>Tanggal</span><span>{new Date(detail.paidAt).toLocaleString('id-ID')}</span></div>
      <div className="flex justify-between"><span>Kasir</span><span>{detail.cashier || '-'}</span></div>
      <div className="flex justify-between"><span>Meja</span><span>{detail.table || 'Standalone'}</span></div>
      <div className="flex justify-between"><span>Metode</span><span>{detail.method || '-'}</span></div>
      {detail.reference ? <div className="flex justify-between"><span>Referensi</span><span>{detail.reference}</span></div> : null}

      {(detail.billingSession?.amount || 0) > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="font-semibold">Rincian Billiard</p>
          <div className="flex justify-between text-slate-700"><span>Durasi main</span><span>{billingDuration} menit</span></div>
          <div className="flex justify-between"><span>Billiard awal</span><span>{formatCurrency(detail.billingSession?.breakdown?.baseAmount || 0)}</span></div>
          {(detail.billingSession?.breakdown?.extensions || []).map((x: any, i: number) => (
            <div key={x.id || i} className="flex justify-between text-slate-600"><span>Perpanjangan #{i + 1} (+{x.additionalMinutes} menit)</span><span>{formatCurrency(x.additionalAmount)}</span></div>
          ))}
          <div className="flex justify-between font-medium"><span>Total Billiard</span><span>{formatCurrency(detail.billingSession?.amount || 0)}</span></div>
        </div>
      )}

      {(detail.packageUsages || []).length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="font-semibold">Rincian Paket</p>
          {(detail.packageUsages || []).map((pkg: any, i: number) => (
            <div key={pkg.id || i} className="mt-1 rounded bg-slate-50 p-2">
              <div className="font-medium">{pkg.packageName}{pkg.qty > 1 ? ` × ${pkg.qty}` : ''}</div>
              {pkg.durationMinutes ? <div className="flex justify-between text-slate-600"><span>Billing {pkg.durationMinutes} menit</span><span>{formatCurrency(pkg.billingEquivalent || 0)}</span></div> : null}
              {(pkg.fnbItems || []).map((f: any, idx: number) => <div key={idx} className="flex justify-between text-slate-600"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}
              <div className="flex justify-between text-slate-700"><span>Diskon</span><span>-{formatCurrency(Math.max(0, Number(pkg.originalPrice || 0) - Number(pkg.packagePrice || 0)))}</span></div>
              <div className="flex justify-between font-semibold"><span>Subtotal</span><span>{formatCurrency(pkg.packagePrice)}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 border-t pt-2"><p className="font-semibold">F&B Tambahan</p>{(detail.fnbItems || []).length === 0 ? <p className="text-slate-500">Tidak ada F&B tambahan</p> : detail.fnbItems.map((f: any, i: number) => <div key={i} className="flex justify-between"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}</div>
      <div className="mt-2 border-t pt-2 space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(detail.subtotal || 0)}</span></div>
        {!!Number(detail.discount || 0) && <div className="flex justify-between text-slate-600"><span>Diskon</span><span>-{formatCurrency(detail.discount || 0)}</span></div>}
        <div className="flex justify-between"><span>Uang Diterima</span><span>{formatCurrency(detail.amountPaid || 0)}</span></div>
        <div className="flex justify-between"><span>Kembalian</span><span>{formatCurrency(detail.change || 0)}</span></div>
        <div className="flex justify-between font-semibold"><span>Total Transaksi</span><span>{formatCurrency(detail.total || 0)}</span></div>
      </div>
    </div>
  );
}
