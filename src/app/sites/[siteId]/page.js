'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatCard from '@/components/StatCard';

export default function SiteDashboardPage() {
  const { siteId } = useParams();
  const [site, setSite] = useState(null);
  const [articles, setArticles] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/sites/${siteId}`).then((r) => r.json()),
      fetch(`/api/sites/${siteId}/articles?perPage=5&sort=score`).then((r) => r.json()),
    ])
      .then(([siteData, articlesData]) => {
        if (siteData.id) setSite(siteData);
        setArticles(articlesData);
      })
      .catch(() => {});
  }, [siteId]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('記事を同期中...');
    try {
      const res = await fetch(`/api/sites/${siteId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(`✅ ${data.articleCount}件の記事を同期しました`);
        // リロード
        const articlesRes = await fetch(`/api/sites/${siteId}/articles?perPage=5&sort=score`);
        setArticles(await articlesRes.json());
        const siteRes = await fetch(`/api/sites/${siteId}`);
        setSite(await siteRes.json());
      } else {
        setSyncMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      setSyncMessage(`❌ エラー: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!site) return <div className="text-gray-500">読み込み中...</div>;

  const gradeColors = {
    critical: 'text-red-600',
    high: 'text-orange-600',
    medium: 'text-amber-600',
    low: 'text-emerald-600',
  };

  return (
    <div className="max-w-6xl">
      {/* アクションボタン */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          {syncing ? '⏳ 同期中...' : '🔄 記事を同期'}
        </button>
        <Link
          href={`/sites/${siteId}/articles`}
          className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          📄 記事一覧
        </Link>
      </div>

      {syncMessage && (
        <div className={`text-sm rounded-lg p-3 mb-4 ${syncMessage.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : syncMessage.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          {syncMessage}
        </div>
      )}

      {/* 統計 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="総記事数" value={site.articleCount || 0} icon="📄" color="blue" />
        <StatCard label="リライト済" value={site.rewrittenCount || 0} icon="✅" color="emerald" />
        <StatCard label="最終同期" value={site.lastSyncAt ? new Date(site.lastSyncAt).toLocaleDateString('ja-JP') : '未同期'} icon="🔄" color="amber" />
        <StatCard label="ステータス" value={site.status === 'active' ? '稼働中' : '停止'} icon={site.status === 'active' ? '🟢' : '⏸️'} color="purple" />
      </div>

      {/* リライト優先度トップ5 */}
      {articles?.articles?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">リライト優先度 TOP5</h2>
          <div className="space-y-3">
            {articles.articles.map((article, i) => (
              <Link
                key={article.wpId}
                href={`/sites/${siteId}/articles/${article.wpId}`}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-lg font-bold text-gray-300 w-6 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{article.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {article.wordCount}字 ・ 更新: {new Date(article.modifiedAt || article.publishedAt).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <span className={`text-2xl font-bold ${gradeColors[article.scoreGrade] || 'text-gray-400'}`}>
                  {article.score ?? '-'}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-center">
            <Link href={`/sites/${siteId}/articles`} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              全記事を見る →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
