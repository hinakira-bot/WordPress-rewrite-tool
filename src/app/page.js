'use client';

import { useState, useEffect } from 'react';
import StatCard from '@/components/StatCard';
import SiteCard from '@/components/SiteCard';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then((r) => r.json()),
      fetch('/api/sites').then((r) => r.json()),
    ])
      .then(([statsData, sitesData]) => {
        setStats(statsData);
        if (Array.isArray(sitesData)) setSites(sitesData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">WordPress 全自動リライトツール</p>
        </div>
        <Link
          href="/sites/add"
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          + サイトを追加
        </Link>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="登録サイト" value={stats.totalSites} icon="🌐" color="blue" />
          <StatCard label="総記事数" value={stats.totalArticles} icon="📄" color="emerald" />
          <StatCard label="リライト済" value={stats.totalRewritten} icon="✅" color="purple" />
          <StatCard label="稼働中" value={stats.activeSites} icon="🟢" color="amber" />
        </div>
      )}

      {/* サイト一覧 */}
      {sites.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-4">🌐</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">まだサイトが登録されていません</h3>
          <p className="text-sm text-gray-500 mb-6">
            WordPressサイトを登録して、記事のリライトを始めましょう
          </p>
          <Link
            href="/sites/add"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            最初のサイトを追加
          </Link>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">登録サイト</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
