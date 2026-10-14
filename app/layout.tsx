import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Broadcast Ad Verification System',
  description: 'Online Broadcast Advertising Verification and Discrepancy Reporting System. Deterministic comparison of planned schedules against actual playout automation logs with Excel and PDF reporting.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900">
        {children}
      </body>
    </html>
  );
}
