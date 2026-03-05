import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: id });
}

export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return format(new Date(date), 'dd MMM yyyy', { locale: id });
}

export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return format(new Date(date), 'HH:mm:ss');
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getRemainingTime(endTime: string | Date): {
  text: string;
  isExpired: boolean;
  isWarning: boolean;
  minutes: number;
} {
  const now = new Date();
  const end = new Date(endTime);
  const diffMs = end.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMs <= 0) {
    return { text: 'Expired', isExpired: true, isWarning: false, minutes: 0 };
  }

  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const s = Math.floor((diffMs % 60000) / 1000);

  const text = h > 0 ? `${h}j ${m}m ${s}d` : `${m}m ${s}d`;
  return { text, isExpired: false, isWarning: diffMin <= 5, minutes: diffMin };
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-500',
    AVAILABLE: 'bg-green-500',
    COMPLETED: 'bg-gray-500',
    CANCELLED: 'bg-red-500',
    OCCUPIED: 'bg-yellow-500',
    MAINTENANCE: 'bg-orange-500',
    PAID: 'bg-green-500',
    PENDING_PAYMENT: 'bg-yellow-500',
    REFUNDED: 'bg-purple-500',
    DRAFT: 'bg-blue-400',
    CONFIRMED: 'bg-blue-600',
  };
  return map[status] || 'bg-gray-500';
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Aktif',
    AVAILABLE: 'Tersedia',
    COMPLETED: 'Selesai',
    CANCELLED: 'Dibatalkan',
    OCCUPIED: 'Terpakai',
    MAINTENANCE: 'Maintenance',
    PAID: 'Lunas',
    PENDING_PAYMENT: 'Menunggu Bayar',
    REFUNDED: 'Refund',
    DRAFT: 'Draft',
    CONFIRMED: 'Dikonfirmasi',
  };
  return map[status] || status;
}
