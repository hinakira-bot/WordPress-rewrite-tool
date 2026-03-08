'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';

export default function ArticleDetailPage() {
  const { siteId, articleId } = useParams();
  const [article, setArticle] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rewriting, setRewriting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info'); // info, diff, freshness, links

  useEffect(() => {
    Promise.all([
      fetch(`/api/sites/${siteId}/articles/${articleId}`).then((r) => r.json()),
      fetch(`/api/sites/${siteId}/articles/${articleId}/preview`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([articleData, previewData]) => {
        setArticle(articleData);
        if (previewData && !previewData.error) {
          setPreview(previewData);
          setActiveTab('diff');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId, articleId]);

  const handleRewrite = async (dryRun = false) => {
    setRewriting(true);
    setError('');
    setProgress('リライトパイプラインを開始中...');

    try {
      const res = await fetch(`/api/sites/${siteId}/articles/${articleId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();

      if (data.success) {
        setProgress(`✅ リライト完了! (${data.elapsed}秒)`);
        // プレビューを取得
        const previewRes = await fetch(`/api/sites/${siteId}/articles/${articleId}/preview`);
        if (previewRes.ok) {
          setPreview(await previewRes.json());
          setActiveTab('diff');
        }
        // 記事データリロード
        const articleRes = await fetch(`/api/sites/${siteId}/articles/${articleId}`);
        setArticle(await articleRes.json());
      } else {
        setError(data.error || 'リライトに失敗しました');
      }
    } catch (err) {
      setError('エラー: ' + err.message);
    } finally {
      setRewriting(false);
    }
  };

  const handleApply = async (status) => {
    setApplying(true);
    setError('');

    try {
      const res = await fetch(`/api/sites/${siteId}/articles/${articleId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();

      if (data.success) {
        setProgress(`✅ ${data.message}`);
        const articleRes = await fetch(`/api/sites/${siteId}/articles/${articleId}`);
        setArticle(await articleRes.json());
      } else {
        setError(data.error || '適用に失敗しました');
      }
    } catch (err) {
      setError('エラー: ' + err.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="text-gray-500">読み込み中...</div>;
  if (!article || article.error) return <div className="text-red-500">記事が見つかりません</div>;

  return (
    <div className="max-w-7xl">
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <ScoreBadge score={article.score} grade={article.scoreGrade} />
            <StatusBadge status={article.rewriteStatus} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{article.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{article.wordCount?.toLocaleString()}字</span>
            <span>H2: {article.h2Count}個</span>
            <span>リンク: {article.linkCount}個</span>
            <span>FAQ: {article.hasFaq ? '✅' : '❌'}</span>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
              記事を見る ↗
            </a>
          </div>
        </div>

        <div className="flex gap-2 ml-4">
          <button
            onClick={() => handleRewrite(true)}
            disabled={rewriting}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            🧪 ドライラン
          </button>
          <button
            onClick={() => handleRewrite(false)}
            disabled={rewriting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {rewriting ? '⏳ リライト中...' : '🔄 リライト実行'}
          </button>
        </div>
      </div>

      {/* メッセージ */}
      {progress && (
        <div className={`text-sm rounded-lg p-3 mb-4 ${progress.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
          {progress}
        </div>
      )}
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {/* スコア詳細 */}
      {article.scoreDetails && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">スコア内訳</h2>
          <div className="flex flex-wrap gap-2">
            {article.scoreDetails.map((detail, i) => (
              <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                {detail}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { key: 'info', label: '📋 記事情報' },
          { key: 'diff', label: '📝 差分プレビュー', disabled: !preview },
          { key: 'freshness', label: '🔍 鮮度レポート', disabled: !preview },
          { key: 'links', label: '🔗 リンクレポート', disabled: !preview },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && setActiveTab(tab.key)}
            disabled={tab.disabled}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : tab.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">記事プレビュー</h2>
          <div
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: article.content?.substring(0, 3000) + '...' }}
          />
        </div>
      )}

      {activeTab === 'diff' && preview && (
        <div className="space-y-4">
          {/* 変更サマリー */}
          {preview.diff?.summary?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">変更サマリー</h2>
              <ul className="space-y-1.5">
                {preview.diff.summary.map((s, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                    <span className="text-emerald-500">●</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 統計 */}
          {preview.diff?.stats && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">+{preview.diff.stats.addedWords}</p>
                <p className="text-xs text-emerald-700">追加</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">-{preview.diff.stats.removedWords}</p>
                <p className="text-xs text-red-700">削除</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-600">{preview.diff.stats.unchangedWords}</p>
                <p className="text-xs text-gray-500">変更なし</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{preview.diff.stats.changePercentage}%</p>
                <p className="text-xs text-blue-700">変更率</p>
              </div>
            </div>
          )}

          {/* 差分ビュー */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">差分プレビュー</h2>
            <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {preview.diff?.diffs?.map((part, i) => (
                <span
                  key={i}
                  className={
                    part.added
                      ? 'bg-emerald-100 text-emerald-800'
                      : part.removed
                        ? 'bg-red-100 text-red-800 line-through'
                        : 'text-gray-700'
                  }
                >
                  {part.value}
                </span>
              ))}
            </div>
          </div>

          {/* 適用ボタン */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => handleApply('draft')}
              disabled={applying}
              className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              📝 下書き保存
            </button>
            <button
              onClick={() => handleApply('publish')}
              disabled={applying}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              🚀 公開して更新
            </button>
          </div>
        </div>
      )}

      {activeTab === 'freshness' && preview?.freshnessReport && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              情報鮮度レポート ({preview.freshnessReport.outdatedCount}件の更新必要)
            </h2>
            <p className="text-sm text-gray-600 mb-4">{preview.freshnessReport.summary}</p>

            {preview.freshnessReport.factChecks?.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-800">情報チェック結果</h3>
                {preview.freshnessReport.factChecks.map((fc, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 text-sm ${fc.changed ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{fc.changed ? '⚠️' : '✅'}</span>
                      <span className="font-medium">{fc.changed ? '要更新' : '最新'}</span>
                      {fc.importance && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${fc.importance === 'high' ? 'bg-red-200 text-red-700' : 'bg-gray-200 text-gray-600'}`}>
                          {fc.importance}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700"><strong>記事内:</strong> {fc.original}</p>
                    {fc.changed && <p className="text-emerald-700"><strong>最新:</strong> {fc.current}</p>}
                    {fc.source && <p className="text-xs text-gray-400 mt-1">出典: {fc.source}</p>}
                  </div>
                ))}
              </div>
            )}

            {preview.freshnessReport.newInfo?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-800 mb-2">追加すべき新情報</h3>
                {preview.freshnessReport.newInfo.map((info, i) => (
                  <div key={i} className="bg-blue-50 rounded-lg p-3 mb-2 text-sm">
                    <p className="font-medium text-blue-800">{info.topic}</p>
                    <p className="text-blue-700">{info.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'links' && preview && (
        <div className="space-y-4">
          {/* 内部リンク */}
          {preview.internalLinkAudit && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                内部リンク ({preview.internalLinkAudit.existing?.length || 0}件,
                リンク切れ {preview.internalLinkAudit.deadCount || 0}件)
              </h2>
              {preview.internalLinkAudit.existing?.map((link, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 border-b border-gray-100 text-sm ${link.status === 'dead' ? 'bg-red-50' : ''}`}>
                  <span>{link.status === 'alive' ? '✅' : '❌'}</span>
                  <span className="flex-1 truncate">{link.text || link.href}</span>
                  <span className="text-xs text-gray-400 truncate max-w-xs">{link.href}</span>
                  {link.suggestion && (
                    <span className="text-xs text-blue-600">→ {link.suggestion.title}</span>
                  )}
                </div>
              ))}

              {preview.internalLinkAudit.suggestedAdditions?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-800 mb-2">追加推奨リンク</h3>
                  {preview.internalLinkAudit.suggestedAdditions.map((s, i) => (
                    <div key={i} className="text-sm text-emerald-700 py-1">
                      ➕ <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a>
                      <span className="text-gray-400 ml-2">({s.reason})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 外部リンク */}
          {preview.externalLinkAudit && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                外部リンク ({preview.externalLinkAudit.existing?.length || 0}件,
                リンク切れ {preview.externalLinkAudit.deadCount || 0}件)
              </h2>
              {preview.externalLinkAudit.existing?.map((link, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 border-b border-gray-100 text-sm ${link.status === 'dead' ? 'bg-red-50' : ''}`}>
                  <span>{link.status === 'alive' ? '✅' : '❌'}</span>
                  <span className="flex-1 truncate">{link.text || link.href}</span>
                  <span className="text-xs text-gray-400">{link.httpStatus}</span>
                </div>
              ))}
            </div>
          )}

          {/* 推奨外部リンク */}
          {preview.externalLinkResearch?.suggestedLinks?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">推奨外部リンク</h2>
              {preview.externalLinkResearch.suggestedLinks.map((s, i) => (
                <div key={i} className="py-2 border-b border-gray-100 text-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{s.title}</a>
                  <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
