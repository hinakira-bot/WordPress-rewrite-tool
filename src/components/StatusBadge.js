'use client';

const STATUS_MAP = {
  active: { label: '有効', color: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: '無効', color: 'bg-gray-100 text-gray-600' },
  pending: { label: '未処理', color: 'bg-amber-100 text-amber-700' },
  rewritten: { label: 'リライト済', color: 'bg-blue-100 text-blue-700' },
  failed: { label: '失敗', color: 'bg-red-100 text-red-700' },
  draft: { label: '下書き', color: 'bg-purple-100 text-purple-700' },
  queued: { label: 'キュー中', color: 'bg-indigo-100 text-indigo-700' },
  syncing: { label: '同期中', color: 'bg-cyan-100 text-cyan-700' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}
