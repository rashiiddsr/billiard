'use client';

import { useEffect, useState, useCallback } from 'react';
import { menuApi, ordersApi, billingApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

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
    setSubmitting(true);
    try {
      const order = await ordersApi.create({
        billingSessionId: selectedSession || undefined,
        notes: orderNotes || undefined,
        items: cart.map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          notes: c.notes,
        })),
      });
      toast.success(`Order ${order.orderNumber} dibuat!`);
      setCart([]);
      setOrderNotes('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal membuat order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden rounded-2xl border border-sky-100 bg-white/70 shadow-sm">
      {/* Menu Panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-6">
        <h1 className="text-2xl font-bold mb-4">Pesanan F&B</h1>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            className="input flex-1"
            placeholder="Cari nama atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input w-40"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">Semua</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory('')}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${!selectedCategory ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Semua
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.name)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${selectedCategory === c.name ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.menuItemId === item.id);
              const stockLow = item.stock?.trackStock && item.stock?.qtyOnHand <= item.stock?.lowStockThreshold;
              const outOfStock = item.stock?.trackStock && item.stock?.qtyOnHand === 0;

              return (
                <button
                  key={item.id}
                  onClick={() => !outOfStock && addToCart(item)}
                  disabled={outOfStock}
                  className={`card text-left hover:ring-2 hover:ring-blue-500 transition-all relative
                    ${inCart ? 'ring-2 ring-blue-500' : ''}
                    ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {inCart && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                      {inCart.quantity}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mb-1">{item.sku}</p>
                  <p className="font-medium text-sm leading-tight">{item.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{item.category}</p>
                  <p className="mt-2 font-bold text-emerald-600">{formatCurrency(item.price)}</p>
                  {stockLow && !outOfStock && (
                    <p className="mt-1 text-xs text-amber-600">⚠ Sisa {item.stock.qtyOnHand}</p>
                  )}
                  {outOfStock && <p className="text-xs text-red-400 mt-1">Habis</p>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-80 border-l border-slate-200 bg-slate-50/90 text-slate-800 flex flex-col">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Keranjang ({cartCount} item)</h2>
        </div>

        {/* Link to Session */}
        <div className="border-b border-slate-200 p-4">
          <label className="label text-xs text-slate-600">Tautkan ke Sesi Meja (opsional)</label>
          <select
            className="input text-sm"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            <option value="">— Standalone —</option>
            {activeSessions.map((s) => (
              <option key={s.id} value={s.id}>{s.table?.name}</option>
            ))}
          </select>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Belum ada item</p>
          ) : (
            cart.map((item) => (
              <div key={item.menuItemId} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(item.price)} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => removeFromCart(item.menuItemId)}
                    className="h-6 w-6 rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => addToCart({ id: item.menuItemId, name: item.name, price: item.price })}
                    className="h-6 w-6 rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Notes */}
        <div className="border-t border-slate-200 p-4">
          <textarea
            className="input text-sm resize-none"
            rows={2}
            placeholder="Catatan order..."
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
          />
        </div>

        {/* Total & Submit */}
        <div className="border-t border-slate-200 p-4">
          <div className="flex justify-between font-bold mb-3">
            <span>Total</span>
            <span className="text-emerald-600">{formatCurrency(cartTotal)}</span>
          </div>
          <button
            onClick={submitOrder}
            disabled={cart.length === 0 || submitting}
            className="btn-success w-full"
          >
            {submitting ? 'Memproses...' : '✓ Kirim Pesanan'}
          </button>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="mt-2 w-full text-sm text-slate-500 transition-colors hover:text-red-500"
            >
              Hapus Semua
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
