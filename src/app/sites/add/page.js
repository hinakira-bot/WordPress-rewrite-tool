'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddSitePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', url: '', username: '', appPassword: '' });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTesting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, testConnection: true }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess(`「${data.name}」を登録しました！`);
        setTimeout(() => router.push(`/sites/${data.id}`), 1500);
      } else {
        setError(data.error || '登録に失敗しました');
      }
    } catch (err) {
      setError('エラー: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">サイトを追加</h1>
      <p className="text-sm text-gray-500 mb-6">新しいWordPressサイトを登録します</p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}
      {success && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">サイト名</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="マイブログ"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">サイトURL *</label>
          <input
            type="url"
            required
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://example.com"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名 *</label>
          <input
            type="text"
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="admin"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">アプリケーションパスワード *</label>
          <input
            type="password"
            required
            value={form.appPassword}
            onChange={(e) => setForm({ ...form, appPassword: e.target.value })}
            placeholder="xxxx xxxx xxxx xxxx"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <p className="text-xs text-gray-400 mt-1">WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={testing}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {testing ? '接続テスト中...' : '接続テスト & 登録'}
          </button>
        </div>
      </form>
    </div>
  );
}
