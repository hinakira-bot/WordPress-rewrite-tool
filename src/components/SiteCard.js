'use client';

import Link from 'next/link';

export default function SiteCard({ site }) {
  const statusColor = site.status === 'active' ? 'bg-emerald-400' : 'bg-gray-400';
  const lastSync = site.lastSyncAt
    ? new Date(site.lastSyncAt).toLocaleDateString('ja-JP')
    : '未同期';

  return (
    <Link
      href={`/sites/${site.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <h3 className="font-semibold text-gray-900 truncate">{site.name}</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">{site.url}</p>
        </div>
        <span className="text-2xl ml-3">🌐</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-500">記事数</p>
          <p className="text-lg font-bold text-gray-900">{site.articleCount || 0}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">リライト済</p>
          <p className="text-lg font-bold text-emerald-600">{site.rewrittenCount || 0}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">最終同期</p>
          <p className="text-sm font-medium text-gray-700 mt-0.5">{lastSync}</p>
        </div>
      </div>
    </Link>
  );
}
