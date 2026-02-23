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
};

// ─── Finance ─────────────────────────────────────────────────────────────────
export const financeApi = {
  getReport: (startDate: string, endDate: string) =>
    api.get('/finance/report', { params: { startDate, endDate } }).then((r) => r.data),
  getDailyReport: (date?: string) =>
    api.get('/finance/report/daily', { params: { date } }).then((r) => r.data),
  createExpense: (data: any) => api.post('/finance/expenses', data).then((r) => r.data),
  listExpenses: (params?: any) => api.get('/finance/expenses', { params }).then((r) => r.data),
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
  getSettings: () => api.get('/iot/settings').then((r) => r.data),
  setGateway: (deviceId: string) =>
    api.patch('/iot/settings/gateway', { deviceId }).then((r) => r.data),
  clearGatewayOverride: () => api.delete('/iot/settings/gateway').then((r) => r.data),
};
