import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'F1 News Scraper',
  description: 'Scrape & Rewrite F1 news to Thai',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, background: '#0D0D10' }}>{children}</body>
    </html>
  );
}
