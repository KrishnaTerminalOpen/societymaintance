import type { Metadata, Viewport } from 'next';
import './globals.css';
import ReactQueryProvider from '@/components/providers/query-provider';
import ServiceWorkerRegister from '@/components/providers/service-worker-register';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'ColonyDeposit | Residential Security Deposit Portal',
  description: 'Streamlined residential security deposit management & UPI payments for colonies.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ColonyDeposit',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <ServiceWorkerRegister />
        <ReactQueryProvider>
          {children}
        </ReactQueryProvider>
        {/* Razorpay Standard Checkout SDK */}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
