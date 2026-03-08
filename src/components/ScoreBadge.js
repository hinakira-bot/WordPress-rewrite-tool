'use client';

const GRADE_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const GRADE_LABELS = {
  critical: '緊急',
  high: '高',
  medium: '中',
  low: '低',
};

export default function ScoreBadge({ score, grade }) {
  const color = GRADE_COLORS[grade] || GRADE_COLORS.low;
  const label = GRADE_LABELS[grade] || '不明';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${color}`}>
      <span className="text-base leading-none">{score}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}
