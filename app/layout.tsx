import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'EMI Management Portal',
  description: 'Professional EMI collection and approval portal',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icon-192.svg', type: 'image/svg+xml', sizes: '192x192' },
    ],
    shortcut: '/logo.svg',
    apple: '/icon-192.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Theme boot — applies the saved theme before first paint (no flash).
            Light is the default; dark applies only when explicitly chosen in
            Settings (or via the System option when the OS prefers dark). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tp-theme');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="overflow-x-hidden pb-20 flex flex-col min-h-screen">
        <div className="flex-1">
          {children}
        </div>
        <Footer />
        <Toaster
          position="top-center"
          toastOptions={{
            style: { borderRadius: '12px', background: '#1e293b', color: '#fff', fontSize: '14px' },
            success: { style: { background: '#16a34a', color: 'white' }, iconTheme: { primary: 'white', secondary: '#16a34a' } },
            error: { style: { background: '#dc2626', color: 'white' }, iconTheme: { primary: 'white', secondary: '#dc2626' } },
          }}
        />
      </body>
    </html>
  );
}
