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
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState('');

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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // キューに追加（単体）
  const addToQueue = async (articleWpId, title) => {
    try {
      const res = await fetch(`/api/sites/${siteId}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleWpId }),
      });
      if (res.ok) {
        showToast(`✅ "${title}" をキューに追加しました`);
      } else {
        const data = await res.json();
        showToast(`⚠️ ${data.error || '追加に失敗'}`);
      }
    } catch {
      showToast('❌ エラーが発生しました');
    }
  };

  // キューに一括追加
  const addSelectedToQueue = async () => {
    if (selected.size === 0) return;
    try {
      const res = await fetch(`/api/sites/${siteId}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', articleWpIds: [...selected] }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`✅ ${data.added}件をキューに追加しました`);
        setSelected(new Set());
      }
    } catch {
      showToast('❌ エラーが発生しました');
    }
  };

  const toggleSelect = (wpId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(wpId)) next.delete(wpId);
      else next.add(wpId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data?.articles) return;
    if (selected.size === data.articles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.articles.map((a) => a.wpId)));
    }
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
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={addSelectedToQueue}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              📋 選択した{selected.size}件をキューに追加
            </button>
          )}
          {data && <p className="text-sm text-gray-500">{data.total}件</p>}
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.startsWith('✅') ? 'bg-emerald-600 text-white' :
          toast.startsWith('⚠️') ? 'bg-amber-500 text-white' :
          'bg-red-600 text-white'
        }`}>
          {toast}
        </div>
      )}

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
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === data.articles.length && data.articles.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">スコア</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">タイトル</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">文字数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">更新日</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ステータス</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">FAQ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {data.articles.map((article) => (
                <tr
                  key={article.wpId}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${gradeColors[article.scoreGrade] || ''}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(article.wpId)}
                      onChange={() => toggleSelect(article.wpId)}
                      className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                    />
                  </td>
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
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToQueue(article.wpId, article.title);
                      }}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap cursor-pointer"
                      title="キューに追加"
                    >
                      + キュー
                    </button>
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
