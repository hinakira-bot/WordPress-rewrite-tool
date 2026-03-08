'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

const PROMPT_LABELS = {
  'freshness-check': {
    title: '最新情報調査',
    description: '記事内の情報（料金・プラン・モデル名等）が最新か検証するプロンプト',
    icon: '🔍',
  },
  'link-audit': {
    title: 'リンク監査',
    description: '内部・外部リンクの妥当性を分析するプロンプト',
    icon: '🔗',
  },
  'faq-generate': {
    title: 'FAQ生成',
    description: '記事テーマに基づくFAQを生成するプロンプト',
    icon: '❓',
  },
  'rewrite-update': {
    title: 'リライト生成',
    description: '調査結果を元に記事をリライトするプロンプト',
    icon: '✏️',
  },
  'external-link-research': {
    title: '外部リンク調査',
    description: '信頼性の高い外部ソースを探すプロンプト',
    icon: '🌐',
  },
};

export default function PromptsPage() {
  const { siteId } = useParams();
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [defaultContent, setDefaultContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchPrompts();
  }, [siteId]);

  const fetchPrompts = async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/prompts`);
      const data = await res.json();
      setPrompts(data.prompts || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleEdit = async (name) => {
    try {
      const res = await fetch(`/api/sites/${siteId}/prompts/${name}`);
      const data = await res.json();
      setEditing(name);
      setEditContent(data.content || '');
      setDefaultContent(data.defaultContent || '');
      setMessage('');
    } catch {
      setMessage('プロンプトの読み込みに失敗しました');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/sites/${siteId}/prompts/${editing}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setMessage('✅ プロンプトを保存しました');
        fetchPrompts();
      } else {
        setMessage('❌ 保存に失敗しました');
      }
    } catch {
      setMessage('❌ エラーが発生しました');
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm('デフォルトのプロンプトに戻しますか？')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/prompts/${editing}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: defaultContent, reset: true }),
      });
      if (res.ok) {
        setEditContent(defaultContent);
        setMessage('✅ デフォルトに戻しました');
        fetchPrompts();
      }
    } catch {
      setMessage('❌ リセットに失敗しました');
    }
    setSaving(false);
  };

  if (loading) return <LoadingSpinner message="プロンプトを読み込み中..." />;

  // 編集モード
  if (editing) {
    const label = PROMPT_LABELS[editing] || { title: editing, description: '', icon: '📝' };

    return (
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setEditing(null)}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            ← 戻る
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {label.icon} {label.title}
          </h1>
        </div>

        {message && (
          <div className={`text-sm rounded-lg p-3 mb-4 ${message.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4">{label.description}</p>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400">
              テンプレート変数: {'{{title}}'}, {'{{content}}'}, {'{{url}}'}, {'{{claims}}'} など
            </span>
            <span className="text-xs text-gray-400">{editContent.length}文字</span>
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            spellCheck={false}
          />
        </div>

        <div className="flex justify-between mt-4">
          <button
            onClick={handleReset}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            デフォルトに戻す
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 一覧表示
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-2">プロンプト設定</h1>
      <p className="text-sm text-gray-500 mb-6">
        リライトに使用するAIプロンプトをカスタマイズできます。サイトごとに個別のプロンプトを設定可能です。
      </p>

      <div className="space-y-3">
        {prompts.map((prompt) => {
          const label = PROMPT_LABELS[prompt.name] || { title: prompt.name, description: '', icon: '📝' };

          return (
            <div
              key={prompt.name}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 transition-colors cursor-pointer"
              onClick={() => handleEdit(prompt.name)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{label.icon}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{label.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{label.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    prompt.status === 'customized'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {prompt.status === 'customized' ? 'カスタム' : 'デフォルト'}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
