import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { RealtimeInitializer } from './realtime-initializer';
import { DevAuthInitializer } from './dev-auth-initializer';
import { cn } from "@/lib/utils";

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Wind Turbine SHM Dashboard',
  description: 'Structural Health Monitoring and Predictive Maintenance System for Wind Turbines',
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans")}>
      <head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <Providers>
          <DevAuthInitializer />
          <RealtimeInitializer />
          {children}
          <ToastContainer />
        </Providers>
      </body>
    </html>
  );
}
