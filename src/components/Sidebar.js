'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const globalNavItems = [
  { href: '/', label: 'ダッシュボード', icon: '📊' },
  { href: '/sites', label: 'サイト管理', icon: '🌐' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [sites, setSites] = useState([]);
  const [expandedSite, setExpandedSite] = useState(null);

  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSites(data);
      })
      .catch(() => {});
  }, []);

  // 現在のURLからサイトIDを抽出
  useEffect(() => {
    const match = pathname?.match(/^\/sites\/([^/]+)/);
    if (match) setExpandedSite(match[1]);
  }, [pathname]);

  const siteSubNav = [
    { path: '', label: 'ダッシュボード', icon: '📈' },
    { path: '/articles', label: '記事一覧', icon: '📄' },
    { path: '/queue', label: 'キュー', icon: '📋' },
    { path: '/history', label: '履歴', icon: '🕐' },
    { path: '/prompts', label: 'プロンプト', icon: '📝' },
    { path: '/settings', label: '設定', icon: '⚙️' },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col shrink-0">
      {/* ロゴ */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">WP リライトツール</h1>
        <p className="text-xs text-gray-400 mt-1">Auto Rewriter v1.0</p>
      </div>

      {/* グローバルナビ */}
      <nav className="p-2">
        {globalNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* サイト一覧 */}
      {sites.length > 0 && (
        <div className="border-t border-gray-700 p-2 flex-1 overflow-y-auto">
          <p className="text-xs text-gray-500 px-3 py-2 uppercase tracking-wider">登録サイト</p>
          {sites.map((site) => {
            const isExpanded = expandedSite === site.id;
            return (
              <div key={site.id}>
                <button
                  onClick={() => setExpandedSite(isExpanded ? null : site.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    isExpanded
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${site.status === 'active' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                  <span className="truncate flex-1">{site.name}</span>
                  <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                </button>

                {isExpanded && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {siteSubNav.map((sub) => {
                      const href = `/sites/${site.id}${sub.path}`;
                      const isSubActive = pathname === href;
                      return (
                        <Link
                          key={sub.path}
                          href={href}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
                            isSubActive
                              ? 'bg-emerald-600/30 text-emerald-300'
                              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          }`}
                        >
                          <span>{sub.icon}</span>
                          <span>{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
