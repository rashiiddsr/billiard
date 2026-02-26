import axios, { AxiosError } from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - add access token
api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = Cookies.get('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        Cookies.set('accessToken', data.accessToken, { expires: 1 / 96 }); // 15 min
        Cookies.set('refreshToken', data.refreshToken, { expires: 7 });
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        // Redirect to login
        Cookies.remove('accessToken');
        Cookies.remove('refreshToken');
        Cookies.remove('user');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
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
  extendSession: (id: string, additionalMinutes: number) =>
    api.patch(`/billing/sessions/${id}/extend`, { additionalMinutes }).then((r) => r.data),
  stopSession: (id: string) =>
    api.patch(`/billing/sessions/${id}/stop`).then((r) => r.data),
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
  get: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data).then((r) => r.data),
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
