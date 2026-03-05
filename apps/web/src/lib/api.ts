import axios, { AxiosError } from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || '15000', 10),
});

// BUG FIX #3a: Cookie expiry disesuaikan dengan JWT expiry yang sebenarnya
// Access token JWT = 15 menit, refresh token JWT = 7 hari
const ACCESS_COOKIE_EXP_DAYS = 15 / (24 * 60); // 15 menit (bukan 1 jam!)
const REFRESH_COOKIE_EXP_DAYS = 7;              // 7 hari (bukan 30 hari!)

const COOKIE_OPTIONS = {
  sameSite: 'strict' as const,
  secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : false,
};

// Mutex: cegah multiple refresh request sekaligus (single tab maupun race condition)
let refreshPromise: Promise<any> | null = null;

// BUG FIX #3b: Buffer proactive refresh = 2 menit sebelum 15 menit expire
// (sebelumnya dihitung dari 60 menit — salah karena JWT hanya 15 menit)
const ACCESS_TOKEN_LIFETIME_MINUTES = 15;
const ACCESS_EXPIRY_BUFFER_MINUTES = 2;
const PROACTIVE_REFRESH_AFTER_MS =
  (ACCESS_TOKEN_LIFETIME_MINUTES - ACCESS_EXPIRY_BUFFER_MINUTES) * 60 * 1000; // 13 menit

// BUG FIX #3c: Naikkan limit retry refresh 401 agar tidak logout karena network glitch sesaat
const REFRESH_401_SOFT_RETRY_LIMIT = 4; // sebelumnya 2 — terlalu rendah
const REFRESH_401_COUNTER_KEY = 'refresh401Count';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function clearAuthStorage() {
  Cookies.remove('accessToken');
  Cookies.remove('refreshToken');
  Cookies.remove('loginAt');
  Cookies.remove('user');
  Cookies.remove('tokenIssuedAt');
}

export function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// BUG FIX #3d: Ganti isSessionNearExpiryByLoginAt → pakai tokenIssuedAt
// (loginAt hanya di-set saat login pertama, bukan setiap refresh — jadi hitung-hitungannya salah)
export function isAccessTokenNearExpiry(): boolean {
  const issuedAt = Cookies.get('tokenIssuedAt');
  if (!issuedAt) return true;
  const issuedAtMs = new Date(issuedAt).getTime();
  if (Number.isNaN(issuedAtMs)) return true;
  return Date.now() - issuedAtMs >= PROACTIVE_REFRESH_AFTER_MS;
}

function getRefresh401Count(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(REFRESH_401_COUNTER_KEY);
  const parsed = Number(raw || '0');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function setRefresh401Count(next: number) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(REFRESH_401_COUNTER_KEY, String(Math.max(0, next)));
}

function resetRefresh401Count() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(REFRESH_401_COUNTER_KEY);
}

// ─── Core refresh ────────────────────────────────────────────────────────────

export async function refreshAuthSession() {
  const refreshToken = Cookies.get('refreshToken');
  if (!refreshToken) {
    // BUG FIX #3e: Kalau tidak ada refresh token, langsung redirect login
    // (sebelumnya throw generic Error yang tidak di-handle dengan benar di interceptor)
    clearAuthStorage();
    redirectToLogin();
    throw new Error('No refresh token — redirecting to login');
  }

  // Mutex: reuse promise yang sedang berjalan agar tidak kirim dua refresh sekaligus
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, { refreshToken })
      .finally(() => {
        refreshPromise = null;
      });
  }

  const { data } = await refreshPromise;

  const now = new Date().toISOString();
  Cookies.set('accessToken', data.accessToken, { expires: ACCESS_COOKIE_EXP_DAYS, ...COOKIE_OPTIONS });
  Cookies.set('refreshToken', data.refreshToken, { expires: REFRESH_COOKIE_EXP_DAYS, ...COOKIE_OPTIONS });
  Cookies.set('tokenIssuedAt', now, { expires: REFRESH_COOKIE_EXP_DAYS, ...COOKIE_OPTIONS });
  // loginAt tetap dipertahankan untuk keperluan audit, tidak diubah
  resetRefresh401Count();

  return data;
}

// ─── Request interceptor ─────────────────────────────────────────────────────

api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor ────────────────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any;
    const status = error.response?.status;
    const isRefreshRequest = original?.url?.includes('/auth/refresh');

    if (status === 401 && !original?._retry && !isRefreshRequest) {
      original._retry = true;

      try {
        const data = await refreshAuthSession();
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError: any) {
        // BUG FIX #3f: Kalau refresh gagal karena apapun (network error / 401 / no token),
        // selalu redirect ke login — tidak ada gunanya terus retry
        clearAuthStorage();
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    // Kalau request refresh itu sendiri yang 401
    if (status === 401 && isRefreshRequest) {
      const nextCount = getRefresh401Count() + 1;
      setRefresh401Count(nextCount);

      if (nextCount >= REFRESH_401_SOFT_RETRY_LIMIT) {
        clearAuthStorage();
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  reAuth: (credential: string, type = 'pin') =>
    api.post('/auth/re-auth', { credential, type }).then((r) => r.data),
};

// ─── Tables ──────────────────────────────────────────────────────────────────
export const tablesApi = {
  list: (includeInactive = false) =>
    api.get('/tables', { params: { includeInactive } }).then((r) => r.data),
  get: (id: string) => api.get(`/tables/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/tables', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/tables/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/tables/${id}`).then((r) => r.data),
  testing: (id: string, durationMinutes?: number) =>
    api.post(`/tables/${id}/testing`, durationMinutes ? { durationMinutes } : {}).then((r) => r.data),
  stopTesting: (id: string) => api.post(`/tables/${id}/testing/stop`).then((r) => r.data),
};

// ─── Billing ─────────────────────────────────────────────────────────────────
export const billingApi = {
  createSession: (data: any) => api.post('/billing/sessions', data).then((r) => r.data),
  getSessions: (params?: any) => api.get('/billing/sessions', { params }).then((r) => r.data),
  getActiveSessions: () => api.get('/billing/sessions/active').then((r) => r.data),
  getSession: (id: string) => api.get(`/billing/sessions/${id}`).then((r) => r.data),
  extendSession: (id: string, additionalMinutes: number, billingPackageId?: string) =>
    api.patch(`/billing/sessions/${id}/extend`, { additionalMinutes, billingPackageId }).then((r) => r.data),
  stopSession: (id: string) =>
    api.patch(`/billing/sessions/${id}/stop`).then((r) => r.data),
  moveSession: (id: string, targetTableId: string) =>
    api.patch(`/billing/sessions/${id}/move`, { targetTableId }).then((r) => r.data),
};

export const packagesApi = {
  list: () => api.get('/packages').then((r) => r.data),
  active: () => api.get('/packages/active').then((r) => r.data),
  create: (data: any) => api.post('/packages', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/packages/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/packages/${id}`).then((r) => r.data),
};

// ─── Menu ────────────────────────────────────────────────────────────────────
export const menuApi = {
  list: (params?: any) => api.get('/menu', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/menu/${id}`).then((r) => r.data),
  categories: () => api.get('/menu/categories').then((r) => r.data),
  getNextSku: (categoryId: string) => api.get(`/menu/categories/${categoryId}/next-sku`).then((r) => r.data),
  createCategory: (data: any) => api.post('/menu/categories', data).then((r) => r.data),
  updateCategory: (id: string, data: any) => api.patch(`/menu/categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) => api.delete(`/menu/categories/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/menu', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/menu/${id}`, data).then((r) => r.data),
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: any) => api.get('/orders', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/orders/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/orders', data).then((r) => r.data),
  confirm: (id: string) => api.patch(`/orders/${id}/confirm`).then((r) => r.data),
  cancel: (id: string) => api.patch(`/orders/${id}/cancel`).then((r) => r.data),
};

// ─── Payments ────────────────────────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: any) => api.get('/payments', { params }).then((r) => r.data),
  createCheckout: (data: any) => api.post('/payments/checkout', data).then((r) => r.data),
  confirmPayment: (id: string, amountPaid: number) =>
    api.patch(`/payments/${id}/confirm`, { amountPaid }).then((r) => r.data),
  markPrinted: (id: string) => api.patch(`/payments/${id}/print`).then((r) => r.data),
  getReceipt: (id: string) => api.get(`/payments/${id}/receipt`).then((r) => r.data),
  voidPayment: (id: string) => api.patch(`/payments/${id}/void`).then((r) => r.data),
  requestVoid: (id: string, reason?: string) => api.patch(`/payments/${id}/void-request`, { reason }).then((r) => r.data),
  listVoidRequests: (status?: 'PENDING' | 'APPROVED' | 'REJECTED') =>
    api.get('/payments/void-requests/list', { params: status ? { status } : undefined }).then((r) => r.data),
  approveVoidRequest: (id: string) => api.patch(`/payments/void-requests/${id}/approve`).then((r) => r.data),
  rejectVoidRequest: (id: string, reason?: string) => api.patch(`/payments/void-requests/${id}/reject`, { reason }).then((r) => r.data),
  deletePayment: (id: string) => api.patch(`/payments/${id}/delete`).then((r) => r.data),
};

// ─── Finance ─────────────────────────────────────────────────────────────────
export const financeApi = {
  getReport: (startDate: string, endDate: string) =>
    api.get('/finance/report', { params: { startDate, endDate } }).then((r) => r.data),
  getDailyReport: (date?: string) =>
    api.get('/finance/report/daily', { params: { date } }).then((r) => r.data),
  createExpense: (data: any) => api.post('/finance/expenses', data).then((r) => r.data),
  updateExpense: (id: string, data: any) => api.patch(`/finance/expenses/${id}`, data).then((r) => r.data),
  deleteExpense: (id: string) => api.delete(`/finance/expenses/${id}`).then((r) => r.data),
  listExpenses: (params?: any) => api.get('/finance/expenses', { params }).then((r) => r.data),
  expenseCategories: () => api.get('/finance/expenses/categories').then((r) => r.data),
};

// ─── Stock ───────────────────────────────────────────────────────────────────
export const stockApi = {
  getFnbStock: () => api.get('/stock/fnb').then((r) => r.data),
  getLowStockAlerts: () => api.get('/stock/fnb/alerts').then((r) => r.data),
  adjustStock: (menuItemId: string, data: any) =>
    api.patch(`/stock/fnb/${menuItemId}/adjust`, data).then((r) => r.data),
  getAssets: () => api.get('/stock/assets').then((r) => r.data),
  createAsset: (data: any) => api.post('/stock/assets', data).then((r) => r.data),
  updateAsset: (id: string, data: any) =>
    api.patch(`/stock/assets/${id}`, data).then((r) => r.data),
};

// ─── Audit ───────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params?: any) => api.get('/audit', { params }).then((r) => r.data),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/users').then((r) => r.data),
  listCashiers: () => api.get('/users/cashiers').then((r) => r.data),
  get: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data).then((r) => r.data),
  getMyProfile: (params?: { startDate?: string; endDate?: string }) => api.get('/users/profile/me', { params }).then((r) => r.data),
  updateMyProfile: (data: any) => api.patch('/users/profile/me', data).then((r) => r.data),
  uploadMyPhoto: (formData: FormData) => api.post('/users/profile/me/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data),
};

// ─── Company ─────────────────────────────────────────────────────────────────
export const companyApi = {
  getProfile: () => api.get('/company/profile').then((r) => r.data),
  updateProfile: (data: any) => api.patch('/company/profile', data).then((r) => r.data),
  uploadLogo: (formData: FormData) => api.post('/company/profile/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data),
  resetLogo: () => api.patch('/company/profile/logo/reset').then((r) => r.data),
};

// ─── IoT ─────────────────────────────────────────────────────────────────────
export const iotApi = {
  listDevices: () => api.get('/iot/devices').then((r) => r.data),
  createDevice: (name: string) => api.post('/iot/devices', { name }).then((r) => r.data),
  updateDevice: (deviceId: string, data: any) => api.patch(`/iot/devices/${deviceId}`, data).then((r) => r.data),
  rotateToken: (deviceId: string) => api.post(`/iot/devices/${deviceId}/rotate-token`).then((r) => r.data),
  testConnection: (deviceId: string) =>
    api.post('/iot/test-connection', { deviceId }).then((r) => r.data),
};

// ─── Notifications ───────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params?: any) => api.get('/notifications', { params }).then((r) => r.data),
  markRead: (id?: string) => api.patch('/notifications/read', undefined, { params: id ? { id } : undefined }).then((r) => r.data),
};
