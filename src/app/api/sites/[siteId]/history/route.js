import { NextResponse } from 'next/server';
import { loadHistory, getHistoryStats } from '@/checkpoint-manager';

// GET: リライト履歴取得
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const trigger = searchParams.get('trigger'); // manual, auto, queue

    let history = loadHistory(siteId);
    const stats = getHistoryStats(siteId);

    // フィルタリング
    if (trigger) {
      history = history.filter((h) => h.triggeredBy === trigger);
    }

    // ページネーション
    const totalCount = history.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;
    const items = history.slice(offset, offset + limit);

    return NextResponse.json({
      history: items,
      stats,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
