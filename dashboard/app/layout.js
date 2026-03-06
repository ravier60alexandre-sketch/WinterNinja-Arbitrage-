import './globals.css';

export const metadata = {
  title: 'HiP-3 Spread Analyzer',
  description: 'Real-time executable spread analyzer for Hyperliquid HiP-3 pairs'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-primary">
        {children}
      </body>
    </html>
  );
}
