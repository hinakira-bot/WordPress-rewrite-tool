'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function SiteSettingsPage() {
  const { siteId } = useParams();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/sites/${siteId}/settings`)
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => {});
  }, [siteId]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/sites/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) setMessage('✅ 設定を保存しました');
      else setMessage('❌ 保存に失敗しました');
    } catch {
      setMessage('❌ エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-gray-500">読み込み中...</div>;

  const updateField = (path, value) => {
    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings));
    let obj = newSettings;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">サイト設定</h1>

      {message && (
        <div className={`text-sm rounded-lg p-3 mb-4 ${message.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="space-y-6">
        {/* リライト設定 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">リライト設定</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">リライトモード</label>
              <select
                value={settings.rewrite?.defaultMode || 'minimal'}
                onChange={(e) => updateField('rewrite.defaultMode', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="minimal">古い情報のみ修正（推奨）</option>
                <option value="partial">情報の追記あり</option>
                <option value="full">全体的なリライト</option>
              </select>
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                {settings.rewrite?.defaultMode === 'minimal' && (
                  <p>📝 古くなった料金・プラン・モデル名等をピンポイントで修正 + FAQ追加。H2構成・文体・画像はそのまま維持します。</p>
                )}
                {settings.rewrite?.defaultMode === 'partial' && (
                  <p>📝 古い情報の修正に加え、調査で判明した新情報を既存セクション内に追記します。H2構成・画像はそのまま維持します。</p>
                )}
                {settings.rewrite?.defaultMode === 'full' && (
                  <p>📝 古い情報の修正 + 新情報追記 + 文体改善・SWELL装飾の追加。H2構成・画像はそのまま維持しつつ、各セクションの本文を大幅に改善します。</p>
                )}
                {!settings.rewrite?.defaultMode && (
                  <p>📝 古くなった料金・プラン・モデル名等をピンポイントで修正 + FAQ追加。H2構成・文体・画像はそのまま維持します。</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">更新方式</label>
              <select
                value={settings.rewrite?.updateMethod || 'draft'}
                onChange={(e) => updateField('rewrite.updateMethod', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="draft">下書き保存（安全・推奨）</option>
                <option value="publish">直接上書き（全自動）</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">1日あたりのリライト数</label>
              <input
                type="number"
                min="1"
                max="20"
                value={settings.rewrite?.articlesPerDay || 3}
                onChange={(e) => updateField('rewrite.articlesPerDay', parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">スケジュール（cron式）</label>
              <input
                type="text"
                value={settings.rewrite?.cronSchedule || '0 10 * * *'}
                onChange={(e) => updateField('rewrite.cronSchedule', e.target.value)}
                placeholder="0 10 * * *"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
              />
              <p className="text-xs text-gray-400 mt-1">例: 0 10 * * * = 毎日10時</p>
            </div>
          </div>
        </div>

        {/* スコアリング設定 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">自動リライト設定</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">最低スコア（自動リライト対象）</label>
            <input
              type="number"
              min="0"
              max="100"
              value={settings.scoring?.minScoreForAutoRewrite || 50}
              onChange={(e) => updateField('scoring.minScoreForAutoRewrite', parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32"
            />
            <p className="text-xs text-gray-400 mt-1">このスコア以上の記事が自動リライト対象になります</p>
          </div>
        </div>

        {/* コンテンツ設定 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">コンテンツ設定</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">リンクスタイル</label>
              <select
                value={settings.content?.linkStyle || 'text'}
                onChange={(e) => updateField('content.linkStyle', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="text">テキストリンクに統一（推奨）</option>
                <option value="decorative">元の装飾を維持（ボタン・ブログカード）</option>
              </select>
              <div className="mt-2 text-xs text-gray-500">
                {(settings.content?.linkStyle || 'text') === 'text' && (
                  <p>🔗 ボタンリンクやブログカードを自然なテキストリンクに変換。文脈に溶け込みやすく、クリック率が高い傾向があります。</p>
                )}
                {settings.content?.linkStyle === 'decorative' && (
                  <p>🎨 元記事のSWELLボタン・関連記事ブログカード等の装飾をそのまま維持します。</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SWELL設定 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">SWELLテーマ設定</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.swell?.enabled ?? true}
              onChange={(e) => updateField('swell.enabled', e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            <span className="text-sm text-gray-700">SWELLテーマ用ブロックを使用（FAQブロック等）</span>
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>
    </div>
  );
}
