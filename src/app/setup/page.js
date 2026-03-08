'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [siteForm, setSiteForm] = useState({ name: '', url: '', username: '', appPassword: '' });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);

  const handleApiKeySubmit = () => {
    if (!apiKey.trim()) {
      setError('Gemini APIキーを入力してください');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError('');
    setTestResult(null);

    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...siteForm, testConnection: true }),
      });
      const data = await res.json();

      if (res.ok) {
        setTestResult({ success: true, site: data });
        setStep(3);
      } else {
        setError(data.error || '接続テストに失敗しました');
      }
    } catch (err) {
      setError('エラー: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleComplete = () => {
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">WP リライトツール</h1>
          <p className="text-sm text-gray-500 mt-2">初回セットアップ</p>
          <div className="flex justify-center gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-8 h-1 rounded-full ${s <= step ? 'bg-emerald-500' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
        )}

        {/* Step 1: Gemini API キー */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Step 1: Gemini API キー</h2>
            <p className="text-sm text-gray-500 mb-4">
              Google AI Studio でAPIキーを取得してください。
              .env ファイルに GEMINI_API_KEY を設定してから、このページを再読み込みしてください。
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm mb-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="text-xs text-gray-400 mb-4">
              ※ APIキーは .env ファイルで管理されます。ここでの入力は確認用です。
            </p>
            <button
              onClick={handleApiKeySubmit}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              次へ
            </button>
          </div>
        )}

        {/* Step 2: WordPress サイト登録 */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Step 2: WordPress サイト登録</h2>
            <p className="text-sm text-gray-500 mb-4">最初のWordPressサイトを登録します。</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">サイト名</label>
                <input
                  type="text"
                  value={siteForm.name}
                  onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
                  placeholder="マイブログ"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">サイトURL</label>
                <input
                  type="url"
                  value={siteForm.url}
                  onChange={(e) => setSiteForm({ ...siteForm, url: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名</label>
                <input
                  type="text"
                  value={siteForm.username}
                  onChange={(e) => setSiteForm({ ...siteForm, username: e.target.value })}
                  placeholder="admin"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">アプリケーションパスワード</label>
                <input
                  type="password"
                  value={siteForm.appPassword}
                  onChange={(e) => setSiteForm({ ...siteForm, appPassword: e.target.value })}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-xs text-gray-400 mt-1">WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                戻る
              </button>
              <button
                onClick={handleTestConnection}
                disabled={testing || !siteForm.url || !siteForm.username || !siteForm.appPassword}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {testing ? '接続テスト中...' : '接続テスト & 登録'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 完了 */}
        {step === 3 && (
          <div className="text-center">
            <p className="text-4xl mb-4">🎉</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">セットアップ完了!</h2>
            <p className="text-sm text-gray-500 mb-2">
              サイト「{testResult?.site?.name}」が正常に登録されました。
            </p>
            <p className="text-sm text-gray-500 mb-6">
              ダッシュボードから記事の同期を開始してください。
            </p>
            <button
              onClick={handleComplete}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              ダッシュボードへ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
