'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function RootLayout({ children }) {
  const [configChecked, setConfigChecked] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/setup')) {
      setConfigChecked(true);
      return;
    }

    const checkConfig = async () => {
      try {
        const res = await fetch('/api/credentials');
        if (res.ok) {
          const data = await res.json();
          if (!data.isConfigured) {
            window.location.href = '/setup';
            return;
          }
        }
      } catch { /* pass */ }
      setConfigChecked(true);
    };

    checkConfig();
  }, [pathname]);

  // セットアップページ
  if (pathname?.startsWith('/setup')) {
    return (
      <html lang="ja">
        <head><title>セットアップ - WP リライトツール</title></head>
        <body className="bg-gray-50">{children}</body>
      </html>
    );
  }

  // 設定チェック中
  if (!configChecked) {
    return (
      <html lang="ja">
        <head><title>WP リライトツール</title></head>
        <body className="bg-gray-50">
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ja">
      <head><title>WP リライトツール</title></head>
      <body className="bg-gray-50">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <div className="p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
