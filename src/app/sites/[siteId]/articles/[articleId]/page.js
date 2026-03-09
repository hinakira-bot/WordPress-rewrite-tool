'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  const [diffMode, setDiffMode] = useState('rendered');
  const [wpEditUrl, setWpEditUrl] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/sites/${siteId}/articles/${articleId}`).then((r) => r.json()),
      fetch(`/api/sites/${siteId}/articles/${articleId}/preview`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([articleData, previewData]) => {
        setArticle(articleData);
        if (previewData && !previewData.error) {
          setPreview(previewData);
          setActiveTab('preview');
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
        setProgress(`リライト完了! (${data.elapsed}秒)`);
        const previewRes = await fetch(`/api/sites/${siteId}/articles/${articleId}/preview`);
        if (previewRes.ok) {
          setPreview(await previewRes.json());
          setActiveTab('preview');
        }
        const articleRes = await fetch(`/api/sites/${siteId}/articles/${articleId}`);
        setArticle(await articleRes.json());
      } else {
        setError(data.error || 'リライトに失敗しました');
      }
    } catch (err) {
      setError(err.message);
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
        setProgress(data.message);
        if (data.editUrl) {
          setWpEditUrl(data.editUrl);
        }
        if (data.url) {
          setWpEditUrl(data.url);
        }
        const articleRes = await fetch(`/api/sites/${siteId}/articles/${articleId}`);
        setArticle(await articleRes.json());
      } else {
        setError(data.error || '適用に失敗しました');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleAddToQueue = async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleWpId: parseInt(articleId, 10) }),
      });
      if (res.ok) {
        showToast('キューに追加しました');
      } else {
        const data = await res.json();
        showToast(data.error || '追加に失敗');
      }
    } catch {
      showToast('エラーが発生しました');
    }
  };

  const cleanHtmlForPreview = (html) => {
    if (!html) return '';
    return html
      .replace(/<!--\s*\/?wp:[^>]*-->/g, '')
      .replace(/<!-- UPDATED:.*?-->/g, '')
      .trim();
  };

  // WordPress管理画面URL（記事URLから生成）
  const getWpEditUrl = () => {
    if (wpEditUrl) return wpEditUrl;
    if (article?.url) {
      try {
        const origin = new URL(article.url).origin;
        return `${origin}/wp-admin/post.php?post=${articleId}&action=edit`;
      } catch { /* */ }
    }
    return '';
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
            <span>FAQ: {article.hasFaq ? 'あり' : 'なし'}</span>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
              公開記事を見る →
            </a>
          </div>
        </div>

        <div className="flex gap-2 ml-4">
          <button
            onClick={handleAddToQueue}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            キューに追加
          </button>
          <button
            onClick={() => handleRewrite(true)}
            disabled={rewriting}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            ドライラン
          </button>
          <button
            onClick={() => handleRewrite(false)}
            disabled={rewriting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {rewriting ? 'リライト中...' : 'リライト実行'}
          </button>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-emerald-600 text-white">
          {toast}
        </div>
      )}

      {/* メッセージ */}
      {progress && (
        <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 mb-4 flex items-center justify-between">
          <span>{progress}</span>
          {wpEditUrl && (
            <a
              href={wpEditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-emerald-700 ml-3"
            >
              WordPress管理画面で確認 →
            </a>
          )}
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
          { key: 'info', label: '記事情報' },
          { key: 'preview', label: 'プレビュー', disabled: !preview },
          { key: 'diff', label: '差分', disabled: !preview },
          { key: 'freshness', label: '鮮度レポート', disabled: !preview },
          { key: 'links', label: 'リンクレポート', disabled: !preview },
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

      {/* === 記事情報タブ === */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">記事プレビュー（原文）</h2>
          <div
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: cleanHtmlForPreview(article.content?.substring(0, 5000)) }}
          />
          {article.content?.length > 5000 && (
            <p className="text-sm text-gray-400 mt-4 text-center">... 以降省略 ...</p>
          )}
        </div>
      )}

      {/* === プレビュータブ === */}
      {activeTab === 'preview' && preview && (
        <div className="space-y-4">
          {/* アクションバー */}
          <div className="flex justify-between items-center bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">
              リライト後のレンダリングプレビューです。
            </p>
            <div className="flex gap-2">
              {getWpEditUrl() && (
                <a
                  href={getWpEditUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1"
                >
                  WordPress管理画面 →
                </a>
              )}
              <button
                onClick={() => handleApply('draft')}
                disabled={applying}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                下書き保存
              </button>
              <button
                onClick={() => handleApply('publish')}
                disabled={applying}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                公開して更新
              </button>
            </div>
          </div>

          {/* WordPress管理画面プレビューのヒント */}
          {getWpEditUrl() && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              <strong>SWELL実画面で確認する方法:</strong> 「下書き保存」→「WordPress管理画面」→ 右上の「プレビュー」ボタンをクリック。
              公開中の記事はそのまま維持され、リビジョンとして保存されます。
            </div>
          )}

          {/* レンダリングプレビュー */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div
              className="prose prose-lg max-w-none
                prose-headings:text-gray-900 prose-headings:font-bold
                prose-h2:text-xl prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2 prose-h2:mt-8
                prose-h3:text-lg prose-h3:mt-6
                prose-p:text-gray-700 prose-p:leading-relaxed
                prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-gray-900
                prose-li:text-gray-700
                prose-table:text-sm
                prose-th:bg-gray-50 prose-th:font-semibold
                prose-td:border-gray-200
              "
              dangerouslySetInnerHTML={{ __html: cleanHtmlForPreview(preview.rewrittenContent) }}
            />
          </div>
        </div>
      )}

      {/* === 差分タブ === */}
      {activeTab === 'diff' && preview && (
        <div className="space-y-4">
          {/* 変更サマリー */}
          {preview.diff?.summary?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">変更サマリー</h2>
              <ul className="space-y-1.5">
                {preview.diff.summary.map((s, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block flex-shrink-0"></span>
                    {s}
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

          {/* 差分表示モード切替 */}
          <div className="flex gap-1 bg-gray-50 rounded-lg p-1 w-fit">
            {[
              { key: 'rendered', label: 'レンダリング比較' },
              { key: 'sidebyside', label: 'サイドバイサイド' },
              { key: 'raw', label: '生HTML差分' },
            ].map((mode) => (
              <button
                key={mode.key}
                onClick={() => setDiffMode(mode.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  diffMode === mode.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* レンダリング比較 */}
          {diffMode === 'rendered' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-emerald-500 rounded-full inline-block"></span>
                リライト後
              </h3>
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: cleanHtmlForPreview(preview.rewrittenContent) }}
              />
            </div>
          )}

          {/* サイドバイサイド */}
          {diffMode === 'sidebyside' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-red-200 p-5 overflow-auto max-h-[70vh]">
                <h3 className="text-sm font-semibold text-red-600 mb-3 sticky top-0 bg-white pb-2 flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-400 rounded-full inline-block"></span>
                  原文（Before）
                </h3>
                <div
                  className="prose prose-sm max-w-none text-gray-600"
                  dangerouslySetInnerHTML={{ __html: cleanHtmlForPreview(preview.originalContent) }}
                />
              </div>
              <div className="bg-white rounded-xl border border-emerald-200 p-5 overflow-auto max-h-[70vh]">
                <h3 className="text-sm font-semibold text-emerald-600 mb-3 sticky top-0 bg-white pb-2 flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-400 rounded-full inline-block"></span>
                  リライト後（After）
                </h3>
                <div
                  className="prose prose-sm max-w-none text-gray-700"
                  dangerouslySetInnerHTML={{ __html: cleanHtmlForPreview(preview.rewrittenContent) }}
                />
              </div>
            </div>
          )}

          {/* 生HTML差分 */}
          {diffMode === 'raw' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">HTML差分</h2>
              <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[70vh] overflow-auto bg-gray-50 p-4 rounded-lg">
                {preview.diff?.diffs?.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added
                        ? 'bg-emerald-100 text-emerald-800'
                        : part.removed
                          ? 'bg-red-100 text-red-800 line-through'
                          : 'text-gray-600'
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 適用ボタン */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => handleApply('draft')}
              disabled={applying}
              className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              下書き保存
            </button>
            <button
              onClick={() => handleApply('publish')}
              disabled={applying}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              公開して更新
            </button>
          </div>
        </div>
      )}

      {/* === 鮮度レポートタブ === */}
      {activeTab === 'freshness' && preview?.freshnessReport && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              情報鮮度レポート ({preview.freshnessReport.outdatedCount || 0}件の更新必要)
            </h2>
            {preview.freshnessReport.summary && (
              <p className="text-sm text-gray-600 mb-4">{preview.freshnessReport.summary}</p>
            )}

            {/* 競合分析 (Phase 1) */}
            {preview.freshnessReport.competitorAnalysis && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-purple-800 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  競合記事分析 (Phase 1)
                </h3>
                {preview.freshnessReport.competitorAnalysis.missingTopics?.length > 0 && (
                  <div className="ml-4 mb-3">
                    <p className="text-xs text-gray-500 mb-1">不足トピック:</p>
                    {preview.freshnessReport.competitorAnalysis.missingTopics.map((t, i) => (
                      <div key={i} className="bg-purple-50 rounded-lg p-2 mb-1 text-sm text-purple-800">
                        {typeof t === 'string' ? t : `${t.topic}: ${t.description || ''}`}
                      </div>
                    ))}
                  </div>
                )}
                {preview.freshnessReport.competitorAnalysis.latestUpdates?.length > 0 && (
                  <div className="ml-4">
                    <p className="text-xs text-gray-500 mb-1">最新情報:</p>
                    {preview.freshnessReport.competitorAnalysis.latestUpdates.map((u, i) => (
                      <div key={i} className="bg-purple-50 rounded-lg p-2 mb-1 text-sm text-purple-700">
                        {typeof u === 'string' ? u : `${u.topic}: ${u.detail || ''}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ファクトチェック (Phase 2) */}
            {preview.freshnessReport.factChecks?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  ファクトチェック (Phase 2)
                </h3>
                <div className="space-y-2">
                  {preview.freshnessReport.factChecks.map((fc, i) => (
                    <div
                      key={i}
                      className={`rounded-lg p-3 text-sm ${fc.changed ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${fc.changed ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
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
              </div>
            )}

            {/* 最新ニュース (Phase 3) */}
            {preview.freshnessReport.latestNews && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-orange-800 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                  最新ニュース・公式発表 (Phase 3)
                </h3>
                {preview.freshnessReport.latestNews.versionUpdates?.length > 0 && (
                  <div className="ml-4 mb-2">
                    <p className="text-xs text-gray-500 mb-1">バージョン更新:</p>
                    {preview.freshnessReport.latestNews.versionUpdates.map((v, i) => (
                      <div key={i} className="bg-orange-50 rounded-lg p-2 mb-1 text-sm text-orange-800">
                        <strong>{v.service || v.name}:</strong> {v.update || v.detail || v.description}
                      </div>
                    ))}
                  </div>
                )}
                {preview.freshnessReport.latestNews.pricingChanges?.length > 0 && (
                  <div className="ml-4 mb-2">
                    <p className="text-xs text-gray-500 mb-1">料金変更:</p>
                    {preview.freshnessReport.latestNews.pricingChanges.map((p, i) => (
                      <div key={i} className="bg-amber-50 rounded-lg p-2 mb-1 text-sm text-amber-800">
                        <strong>{p.service || p.name}:</strong> {p.change || p.detail || p.description}
                      </div>
                    ))}
                  </div>
                )}
                {preview.freshnessReport.latestNews.newFeatures?.length > 0 && (
                  <div className="ml-4">
                    <p className="text-xs text-gray-500 mb-1">新機能:</p>
                    {preview.freshnessReport.latestNews.newFeatures.map((f, i) => (
                      <div key={i} className="bg-blue-50 rounded-lg p-2 mb-1 text-sm text-blue-800">
                        <strong>{f.service || f.name}:</strong> {f.feature || f.detail || f.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 追加情報 */}
            {preview.freshnessReport.newInfo?.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-800 mb-2">追加すべき新情報</h3>
                {preview.freshnessReport.newInfo.map((info, i) => (
                  <div key={i} className="bg-blue-50 rounded-lg p-3 mb-2 text-sm">
                    <p className="font-medium text-blue-800">{info.topic}</p>
                    <p className="text-blue-700">{info.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 推奨アクション */}
            {preview.freshnessReport.recommendations?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-800 mb-2">推奨アクション</h3>
                <ul className="space-y-1">
                  {preview.freshnessReport.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-amber-500 inline-block flex-shrink-0"></span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === リンクレポートタブ === */}
      {activeTab === 'links' && preview && (
        <div className="space-y-4">
          {preview.internalLinkAudit && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                内部リンク ({preview.internalLinkAudit.existing?.length || 0}件,
                リンク切れ {preview.internalLinkAudit.deadCount || 0}件)
              </h2>
              {preview.internalLinkAudit.existing?.map((link, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 border-b border-gray-100 text-sm ${link.status === 'dead' ? 'bg-red-50' : ''}`}>
                  <span className={`w-2 h-2 rounded-full ${link.status === 'alive' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
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
                      + <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a>
                      <span className="text-gray-400 ml-2">({s.reason})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {preview.externalLinkAudit && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                外部リンク ({preview.externalLinkAudit.existing?.length || 0}件,
                リンク切れ {preview.externalLinkAudit.deadCount || 0}件)
              </h2>
              {preview.externalLinkAudit.existing?.map((link, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 border-b border-gray-100 text-sm ${link.status === 'dead' ? 'bg-red-50' : ''}`}>
                  <span className={`w-2 h-2 rounded-full ${link.status === 'alive' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <span className="flex-1 truncate">{link.text || link.href}</span>
                  <span className="text-xs text-gray-400">{link.httpStatus}</span>
                </div>
              ))}
            </div>
          )}

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
