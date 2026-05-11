import type { Metadata } from 'next';
import { Noto_Sans_Lao } from 'next/font/google';
import type { ReactNode } from 'react';

import { ApiFetchCredentials } from '@/components/api-fetch-credentials';

import './globals.css';

const notoSansLao = Noto_Sans_Lao({
  subsets: ['lao'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-lao'
});

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
      <body className={notoSansLao.variable} suppressHydrationWarning>
        <ApiFetchCredentials />
        {children}
      </body>
    </html>
  );
}
