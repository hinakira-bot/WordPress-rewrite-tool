'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';

const subNavItems = [
  { path: '', label: 'ダッシュボード', icon: '📈' },
  { path: '/articles', label: '記事一覧', icon: '📄' },
  { path: '/queue', label: 'キュー', icon: '📋' },
  { path: '/history', label: '履歴', icon: '🕐' },
  { path: '/prompts', label: 'プロンプト', icon: '📝' },
  { path: '/settings', label: '設定', icon: '⚙️' },
];

export default function SiteLayout({ children }) {
  const pathname = usePathname();
  const params = useParams();
  const siteId = params?.siteId;
  const [site, setSite] = useState(null);

  useEffect(() => {
    if (siteId) {
      fetch(`/api/sites/${siteId}`)
        .then((r) => r.json())
        .then((data) => { if (data.id) setSite(data); })
        .catch(() => {});
    }
  }, [siteId]);

  return (
    <div>
      {/* サイトヘッダー */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/sites" className="hover:text-gray-700">サイト管理</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{site?.name || '読み込み中...'}</span>
        </div>
        {site && (
          <p className="text-sm text-gray-400">{site.url}</p>
        )}
      </div>

      {/* サブナビゲーション */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {subNavItems.map((item) => {
          const href = `/sites/${siteId}${item.path}`;
          const isActive = item.path === ''
            ? pathname === `/sites/${siteId}`
            : pathname?.startsWith(href);

          return (
            <Link
              key={item.path}
              href={href}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
