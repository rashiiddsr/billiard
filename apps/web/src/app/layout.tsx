import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Billiard POS',
  description: 'Billiard Billing + Cafe POS + IoT System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-white text-slate-800 antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#ffffff',
                color: '#334155',
                border: '1px solid #e2e8f0',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
