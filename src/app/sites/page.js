'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SiteCard from '@/components/SiteCard';

export default function SitesPage() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSites(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">読み込み中...</div>;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">サイト管理</h1>
          <p className="text-sm text-gray-500 mt-1">WordPressサイトの登録・管理</p>
        </div>
        <Link
          href="/sites/add"
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          + サイトを追加
        </Link>
      </div>

      {sites.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-4">🌐</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">サイトが登録されていません</h3>
          <p className="text-sm text-gray-500 mb-6">WordPressサイトを登録してリライトを始めましょう</p>
          <Link
            href="/sites/add"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            最初のサイトを追加
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}
