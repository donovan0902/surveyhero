import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ConvexClientProvider } from '@/components/ConvexClientProvider';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SurveyHero',
  description: 'Build voice-agent surveys',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ConvexClientProvider expectAuth={!!accessToken} initialAuth={initialAuth}>
          {children}
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
