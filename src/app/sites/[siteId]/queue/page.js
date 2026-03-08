'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import QueueList from '@/components/QueueList';
import EmptyState from '@/components/EmptyState';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function QueuePage() {
  const { siteId } = useParams();
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/queue`);
      const data = await res.json();
      setQueue(data.queue || []);
      setStats(data.stats || null);
    } catch { /* ignore */ }
    setLoading(false);
  }, [siteId]);

  const fetchPipelineStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/pipeline`);
      const data = await res.json();
      setPipelineStatus(data);
    } catch { /* ignore */ }
  }, [siteId]);

  useEffect(() => {
    fetchQueue();
    fetchPipelineStatus();
    const interval = setInterval(() => {
      fetchQueue();
      fetchPipelineStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue, fetchPipelineStatus]);

  const handleRemove = async (queueId) => {
    await fetch(`/api/sites/${siteId}/queue?id=${queueId}`, { method: 'DELETE' });
    fetchQueue();
  };

  const handleClear = async () => {
    await fetch(`/api/sites/${siteId}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    fetchQueue();
  };

  const handleProcessQueue = async () => {
    setProcessing(true);
    setConfirmAction(null);
    try {
      await fetch(`/api/sites/${siteId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'queue' }),
      });
    } catch { /* ignore */ }
    setProcessing(false);
    fetchPipelineStatus();
  };

  const handleAutoRewrite = async () => {
    setProcessing(true);
    setConfirmAction(null);
    try {
      await fetch(`/api/sites/${siteId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto' }),
      });
    } catch { /* ignore */ }
    setProcessing(false);
    fetchPipelineStatus();
  };

  if (loading) return <LoadingSpinner message="キューを読み込み中..." />;

  const pendingCount = stats?.pending || 0;
  const isRunning = pipelineStatus?.running;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">リライトキュー</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmAction('auto')}
            disabled={isRunning || processing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            自動選定リライト
          </button>
          <button
            onClick={() => setConfirmAction('queue')}
            disabled={isRunning || processing || pendingCount === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            キュー実行 ({pendingCount}件)
          </button>
        </div>
      </div>

      {/* パイプライン実行状態 */}
      {isRunning && pipelineStatus && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
            <span className="text-sm font-medium text-emerald-800">
              {pipelineStatus.step === 'queue' ? 'キュー処理中' : pipelineStatus.step === 'auto' ? '自動リライト中' : '処理中'}
            </span>
          </div>
          <div className="w-full bg-emerald-200 rounded-full h-2 mb-2">
            <div
              className="bg-emerald-600 h-2 rounded-full transition-all"
              style={{ width: `${pipelineStatus.progress || 0}%` }}
            />
          </div>
          <p className="text-xs text-emerald-700">
            {pipelineStatus.currentArticle || '準備中...'}
            {pipelineStatus.processed > 0 && ` (${pipelineStatus.processed}/${pipelineStatus.total})`}
          </p>
          {/* ログ表示 */}
          {pipelineStatus.logs?.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto bg-gray-900 rounded-lg p-3">
              {pipelineStatus.logs.slice(-20).map((log, i) => (
                <div key={i} className={`text-xs font-mono ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-gray-300'}`}>
                  <span className="text-gray-500">{log.time}</span> {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 統計カード */}
      {stats && (stats.total > 0) && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '待機中', value: stats.pending, color: 'text-amber-600' },
            { label: '処理中', value: stats.processing, color: 'text-blue-600' },
            { label: '完了', value: stats.completed, color: 'text-emerald-600' },
            { label: '失敗', value: stats.failed, color: 'text-red-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* キューリスト */}
      {queue.length > 0 ? (
        <QueueList items={queue} onRemove={handleRemove} onClear={handleClear} />
      ) : (
        <EmptyState
          icon="📋"
          title="キューは空です"
          description="記事一覧からリライト対象を追加するか、「自動選定リライト」でスコアの高い記事を自動処理できます"
        />
      )}

      {/* 確認ダイアログ */}
      <ConfirmDialog
        open={confirmAction === 'queue'}
        title="キュー処理を実行"
        message={`キュー内の${pendingCount}件の記事を順番にリライトします。処理中は他のリライトを実行できません。`}
        confirmLabel="実行する"
        variant="info"
        onConfirm={handleProcessQueue}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'auto'}
        title="自動選定リライト"
        message="リライトスコアが高い記事を自動的に選定してリライトします。設定の「1日あたりのリライト数」に基づいて処理件数が決まります。"
        confirmLabel="実行する"
        variant="info"
        onConfirm={handleAutoRewrite}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
