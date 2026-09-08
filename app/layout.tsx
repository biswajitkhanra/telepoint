import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Telepoint — EMI Management',
  description: 'Professional EMI collection and management portal',
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
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1e293b" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Theme boot — applies saved theme before first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try{var t=localStorage.getItem('tp-theme');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}
  function setVh(){document.documentElement.style.setProperty('--vh',window.innerHeight*0.01+'px');}
  setVh();window.addEventListener('resize',setVh);
})();`,
          }}
        />
      </head>
      {/* app-shell: fixed 100dvh viewport, no global scroll, flex column. */}
      <body className="app-shell bg-surface-2 text-ink font-sans antialiased">
        {children}
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

