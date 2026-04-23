import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'BIZGITAL Marketing Report',
  description: 'Business-ready monthly reporting workflow for BIZGITAL Marketing Report.',
  icons: {
    icon: [{ url: '/branding/bizgital-logo-2.png', type: 'image/png' }],
    shortcut: ['/branding/bizgital-logo-2.png'],
    apple: [{ url: '/branding/bizgital-logo-2.png' }]
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
