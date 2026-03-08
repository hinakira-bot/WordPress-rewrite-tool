'use client';

import StatusBadge from './StatusBadge';

export default function QueueList({ items, onRemove, onClear }) {
  if (!items || items.length === 0) return null;

  const statusMap = {
    pending: { label: '待機中', variant: 'pending' },
    processing: { label: '処理中', variant: 'processing' },
    completed: { label: '完了', variant: 'rewritten' },
    failed: { label: '失敗', variant: 'failed' },
  };

  const priorityLabel = {
    high: { text: '高', className: 'text-red-600 bg-red-50' },
    normal: { text: '中', className: 'text-gray-600 bg-gray-50' },
    low: { text: '低', className: 'text-blue-600 bg-blue-50' },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">キューアイテム</h3>
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            完了/失敗をクリア
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((item) => {
          const status = statusMap[item.status] || statusMap.pending;
          const priority = priorityLabel[item.priority] || priorityLabel.normal;

          return (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${priority.className}`}>
                    {priority.text}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(item.addedAt).toLocaleString('ja-JP', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {item.error && (
                    <span className="text-xs text-red-500 truncate max-w-[200px]">{item.error}</span>
                  )}
                </div>
              </div>
              <StatusBadge status={status.variant} />
              {item.status === 'pending' && onRemove && (
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  title="キューから削除"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
