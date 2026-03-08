'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';

export default function ArticlesPage() {
  const { siteId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('score');
  const [page, setPage] = useState(1);

  const fetchArticles = () => {
    setLoading(true);
    const params = new URLSearchParams({
      sort,
      order: 'desc',
      status: statusFilter,
      search,
      page: String(page),
      perPage: '30',
    });
    fetch(`/api/sites/${siteId}/articles?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchArticles(); }, [siteId, sort, statusFilter, page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchArticles();
  };

  const gradeColors = {
    critical: 'bg-red-50',
    high: 'bg-orange-50',
    medium: 'bg-amber-50',
    low: '',
  };

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">記事一覧</h1>
        {data && <p className="text-sm text-gray-500">{data.total}件</p>}
      </div>

      {/* フィルター */}
      <div className="flex flex-wrap gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="タイトルで検索..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <button type="submit" className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm cursor-pointer">🔍</button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm cursor-pointer"
        >
          <option value="all">全ステータス</option>
          <option value="pending">未処理</option>
          <option value="rewritten">リライト済</option>
          <option value="failed">失敗</option>
        </select>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm cursor-pointer"
        >
          <option value="score">スコア順</option>
          <option value="date">更新日順</option>
          <option value="wordCount">文字数順</option>
          <option value="title">タイトル順</option>
        </select>
      </div>

      {/* 記事テーブル */}
      {loading ? (
        <div className="text-gray-500 text-center py-12">読み込み中...</div>
      ) : !data?.articles?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-4">📄</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">記事がありません</h3>
          <p className="text-sm text-gray-500">サイトダッシュボードから記事を同期してください</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">スコア</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">タイトル</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">文字数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">更新日</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ステータス</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">FAQ</th>
              </tr>
            </thead>
            <tbody>
              {data.articles.map((article) => (
                <tr
                  key={article.wpId}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${gradeColors[article.scoreGrade] || ''}`}
                >
                  <td className="px-4 py-3">
                    <ScoreBadge score={article.score} grade={article.scoreGrade} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/sites/${siteId}/articles/${article.wpId}`}
                      className="text-sm font-medium text-gray-900 hover:text-emerald-600 line-clamp-1"
                    >
                      {article.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{article.wordCount?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(article.modifiedAt || article.publishedAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={article.rewriteStatus} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {article.hasFaq ? '✅' : '❌'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ページネーション */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                {data.total}件中 {(page - 1) * 30 + 1}-{Math.min(page * 30, data.total)}件
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50 cursor-pointer"
                >
                  ← 前
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= data.totalPages}
                  className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50 cursor-pointer"
                >
                  次 →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
