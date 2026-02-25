'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { menuApi, ordersApi, billingApi, paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER';

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

interface MenuCategory {
  id: string;
  name: string;
  skuPrefix?: string;
}

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const presetSession = searchParams.get('sessionId') || '';
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [receipt, setReceipt] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const [menuData, catData, sessions] = await Promise.all([
        menuApi.list({ isActive: true }),
        menuApi.categories(),
        billingApi.getActiveSessions(),
      ]);
      const normalizedMenu = (menuData.data || menuData || []).map((item: any) => ({
        ...item,
        stock: item.stock || {
          trackStock: !!item.trackStock,
          qtyOnHand: item.qtyOnHand ?? 0,
          lowStockThreshold: item.lowStockThreshold ?? 0,
        },
      }));

      setMenuItems(normalizedMenu);
      setCategories((catData || []).map((cat: any) => (typeof cat === 'string'
        ? { id: cat, name: cat }
        : { id: cat.id, name: cat.name, skuPrefix: cat.skuPrefix })));
      setActiveSessions(sessions);
      if (presetSession) setSelectedSession(presetSession);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [presetSession]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredItems = menuItems.filter((item) => {
    const matchCat = !selectedCategory || item.category === selectedCategory;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const addToCart = (item: any) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: parseFloat(item.price), quantity: 1 }];
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => {
      const item = prev.find((c) => c.menuItemId === menuItemId);
      if (!item) return prev;
      if (item.quantity === 1) return prev.filter((c) => c.menuItemId !== menuItemId);
      return prev.map((c) => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const submitOrder = async () => {
    if (cart.length === 0) { toast.error('Keranjang kosong'); return; }
    if (!selectedSession) {
      setShowCheckoutModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const order = await ordersApi.create({
        billingSessionId: selectedSession,
        notes: orderNotes || undefined,
        items: cart.map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          notes: c.notes,
        })),
      });
      toast.success(`Order ${order.orderNumber} ditautkan ke meja`);
      setCart([]);
      setOrderNotes('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal membuat order');
    } finally {
      setSubmitting(false);
    }
  };

  const submitStandaloneCheckout = async () => {
    if (cart.length === 0) return;
    const expectedTotal = cartTotal;
    const paid = parseFloat(amountPaid || '0');
    if ((method === 'QRIS' || method === 'TRANSFER') && !reference.trim()) {
      toast.error('Referensi pembayaran wajib diisi');
      return;
    }
    if (paid < expectedTotal) {
      toast.error('Uang diterima kurang dari total');
      return;
    }

    setSubmitting(true);
    try {
      const order = await ordersApi.create({
        notes: orderNotes || undefined,
        items: cart.map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          notes: c.notes,
        })),
      });

      const payment = await paymentsApi.createCheckout({
        orderIds: [order.id],
        method,
        discountAmount: 0,
        reference: reference || undefined,
        amountPaid: paid,
      });

      const receiptData = await paymentsApi.getReceipt(payment.id);
      setReceipt(receiptData);

      toast.success(`Checkout selesai • ID transaksi ${payment.paymentNumber}`);
      setShowCheckoutModal(false);
      setCart([]);
      setOrderNotes('');
      setReference('');
      setAmountPaid('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Checkout gagal');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if ((method === 'QRIS' || method === 'TRANSFER') && showCheckoutModal) {
      setAmountPaid(String(cartTotal));
    }
  }, [method, cartTotal, showCheckoutModal]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden rounded-2xl border border-sky-100 bg-white/70 shadow-sm">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <h1 className="mb-4 text-2xl font-bold">Pesanan F&B</h1>
          <div className="mb-4 flex gap-3">
            <input type="text" className="input flex-1" placeholder="Cari nama atau SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input w-40" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="">Semua</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            <button onClick={() => setSelectedCategory('')} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${!selectedCategory ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Semua</button>
            {categories.map((c) => <button key={c.id} onClick={() => setSelectedCategory(c.name)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${selectedCategory === c.name ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{c.name}</button>)}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.menuItemId === item.id);
                const stockLow = item.stock?.trackStock && item.stock?.qtyOnHand <= item.stock?.lowStockThreshold;
                const outOfStock = item.stock?.trackStock && item.stock?.qtyOnHand === 0;

                return (
                  <button key={item.id} onClick={() => !outOfStock && addToCart(item)} disabled={outOfStock} className={`card relative text-left transition-all hover:ring-2 hover:ring-blue-500 ${inCart ? 'ring-2 ring-blue-500' : ''} ${outOfStock ? 'cursor-not-allowed opacity-50' : ''}`}>
                    {inCart && <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">{inCart.quantity}</div>}
                    <p className="mb-1 text-xs text-slate-400">{item.sku}</p>
                    <p className="text-sm font-medium leading-tight">{item.name}</p>
                    <p className="mt-2 font-bold text-emerald-600">{formatCurrency(item.price)}</p>
                    {stockLow && !outOfStock && <p className="mt-1 text-xs text-amber-600">⚠ Sisa {item.stock.qtyOnHand}</p>}
                    {outOfStock && <p className="mt-1 text-xs text-red-400">Habis</p>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex w-80 flex-col border-l border-slate-200 bg-slate-50/90 text-slate-800">
          <div className="border-b border-slate-200 p-4"><h2 className="font-semibold">Keranjang ({cartCount} item)</h2></div>
          <div className="border-b border-slate-200 p-4">
            <label className="label text-xs text-slate-600">Tautkan ke Sesi Meja (opsional)</label>
            <select className="input text-sm" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
              <option value="">— Standalone —</option>
              {activeSessions.map((s) => <option key={s.id} value={s.id}>{s.table?.name}</option>)}
            </select>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {cart.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Belum ada item</p> : cart.map((item) => (
              <div key={item.menuItemId} className="flex items-center justify-between">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-slate-500">{formatCurrency(item.price)} × {item.quantity}</p></div>
                <div className="ml-2 flex items-center gap-2">
                  <button onClick={() => removeFromCart(item.menuItemId)} className="h-6 w-6 rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300">-</button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button onClick={() => addToCart({ id: item.menuItemId, name: item.name, price: item.price })} className="h-6 w-6 rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 p-4"><textarea className="input resize-none text-sm" rows={2} placeholder="Catatan order..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} /></div>
          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex justify-between font-bold"><span>Total</span><span className="text-emerald-600">{formatCurrency(cartTotal)}</span></div>
            <button onClick={submitOrder} disabled={cart.length === 0 || submitting} className="btn-success w-full">{submitting ? 'Memproses...' : '✓ Kirim Pesanan'}</button>
          </div>
        </div>
      </div>

      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <h3 className="mb-3 text-lg font-semibold">Checkout Standalone</h3>
            <div className="mb-3 max-h-48 space-y-1 overflow-auto rounded border border-slate-200 p-2 text-sm">
              {cart.map((item) => <div key={item.menuItemId} className="flex justify-between"><span>{item.name} × {item.quantity}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}
            </div>
            <p className="mb-2 text-sm text-slate-600">Catatan: {orderNotes || '-'}</p>
            <div className="mb-3 flex gap-2">{(['CASH', 'QRIS', 'TRANSFER'] as PaymentMethod[]).map((m) => <button key={m} onClick={() => setMethod(m)} className={`flex-1 rounded-lg py-2 text-sm ${method === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{m}</button>)}</div>
            {(method === 'QRIS' || method === 'TRANSFER') && <input type="text" className="input mb-3" placeholder="Referensi pembayaran (wajib)" value={reference} onChange={(e) => setReference(e.target.value)} />}
            <input type="number" className="input mb-2" placeholder="Uang diterima" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} readOnly={method !== 'CASH'} />
            {method === 'CASH' && (
              <div className="mb-2 flex flex-wrap gap-2">
                {[Math.ceil(cartTotal / 1000) * 1000, Math.ceil(cartTotal / 5000) * 5000, Math.ceil(cartTotal / 10000) * 10000, 50000, 100000]
                  .filter((v, i, arr) => v >= cartTotal && arr.indexOf(v) === i)
                  .map((amt) => (
                    <button key={amt} onClick={() => setAmountPaid(String(amt))} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">{formatCurrency(amt)}</button>
                  ))}
              </div>
            )}
            <div className="mb-4 rounded bg-slate-50 p-2 text-sm font-semibold">Total: {formatCurrency(cartTotal)} • Kembalian: {formatCurrency(Math.max(0, (parseFloat(amountPaid || '0') || 0) - cartTotal))}</div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowCheckoutModal(false)}>Batal</button>
              <button className="btn-primary flex-1" onClick={submitStandaloneCheckout} disabled={submitting}>{submitting ? 'Memproses...' : 'Konfirmasi'}</button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4">
            <div className="mb-2 text-center"><h3 className="text-lg font-bold">🧾 Struk Pembayaran</h3><p className="text-xs text-slate-500">Status Cetak: Sudah tercetak</p></div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>No Transaksi</span><span className="font-mono text-xs">{receipt.paymentNumber}</span></div>
              <div className="flex justify-between"><span>Kasir</span><span>{receipt.cashier}</span></div>
              <div className="flex justify-between"><span>Waktu</span><span>{new Date(receipt.paidAt).toLocaleString('id-ID')}</span></div>
              <p className="font-semibold">F&B Standalone</p>
              {(receipt.fnbItems || []).map((f: any, i: number) => <div key={i} className="flex justify-between"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}
              <div className="flex justify-between"><span>Diskon</span><span>{formatCurrency(receipt.discount || 0)}</span></div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>TOTAL</span><span>{formatCurrency(receipt.total)}</span></div>
              <div className="flex justify-between"><span>Uang Diterima</span><span>{formatCurrency(receipt.amountPaid || 0)}</span></div>
              <div className="flex justify-between"><span>Kembalian</span><span>{formatCurrency(receipt.change || 0)}</span></div>
            </div>
            <button className="btn-primary mt-4 w-full" onClick={() => setReceipt(null)}>Tutup</button>
          </div>
        </div>
      )}
    </>
  );
}
