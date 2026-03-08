'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import EmptyState from '@/components/EmptyState';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatusBadge from '@/components/StatusBadge';

export default function HistoryPage() {
  const { siteId } = useParams();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (filter) params.set('trigger', filter);
        const res = await fetch(`/api/sites/${siteId}/history?${params}`);
        const data = await res.json();
        setHistory(data.history || []);
        setStats(data.stats || null);
        setPagination(data.pagination || null);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchHistory();
  }, [siteId, page, filter]);

  const triggerLabel = {
    manual: { text: '手動', className: 'bg-blue-50 text-blue-700' },
    auto: { text: '自動', className: 'bg-purple-50 text-purple-700' },
    queue: { text: 'キュー', className: 'bg-amber-50 text-amber-700' },
  };

  const methodLabel = {
    draft: '下書き',
    publish: '上書き',
    dryrun: 'ドライラン',
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">リライト履歴</h1>

      {/* 統計 */}
      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: '総リライト数', value: stats.total, color: 'text-gray-900' },
            { label: '直近30日', value: stats.last30Days, color: 'text-blue-600' },
            { label: '成功率', value: `${stats.successRate}%`, color: 'text-emerald-600' },
            { label: '鮮度修正', value: stats.totalFreshnessIssues, color: 'text-amber-600' },
            { label: 'リンク修正', value: stats.totalLinksFixed, color: 'text-purple-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        {[
          { value: '', label: 'すべて' },
          { value: 'manual', label: '手動' },
          { value: 'auto', label: '自動' },
          { value: 'queue', label: 'キュー' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
              filter === f.value
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner message="履歴を読み込み中..." />
      ) : history.length === 0 ? (
        <EmptyState
          icon="🕐"
          title="履歴はまだありません"
          description="記事のリライトを実行すると、ここに履歴が表示されます"
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">記事</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">結果</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">トリガー</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">方式</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">変更</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">所要時間</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">実行日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((item) => {
                  const trigger = triggerLabel[item.triggeredBy] || triggerLabel.manual;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[250px]">
                          {item.title}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.success ? 'rewritten' : 'failed'} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${trigger.className}`}>
                          {trigger.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {methodLabel[item.updateMethod] || item.updateMethod}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {item.freshnessIssues > 0 && (
                            <span className="text-xs text-amber-600" title="鮮度修正">
                              🔄{item.freshnessIssues}
                            </span>
                          )}
                          {item.linksFixed > 0 && (
                            <span className="text-xs text-blue-600" title="リンク修正">
                              🔗{item.linksFixed}
                            </span>
                          )}
                          {item.faqAdded && (
                            <span className="text-xs text-purple-600" title="FAQ追加">
                              ❓
                            </span>
                          )}
                          {!item.freshnessIssues && !item.linksFixed && !item.faqAdded && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {item.elapsed ? `${item.elapsed}秒` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(item.executedAt).toLocaleString('ja-JP', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 rounded-lg cursor-pointer"
              >
                前へ
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 rounded-lg cursor-pointer"
              >
                次へ
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
