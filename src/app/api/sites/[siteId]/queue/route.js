import { NextResponse } from 'next/server';
import { loadQueue, addToQueue, addBatchToQueue, removeFromQueue, clearCompletedQueue, getQueueStats } from '@/queue-manager';

// GET: キュー一覧取得
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const queue = loadQueue(siteId);
    const stats = getQueueStats(siteId);
    return NextResponse.json({ queue, stats });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: キューに追加
export async function POST(request, { params }) {
  try {
    const { siteId } = await params;
    const body = await request.json();

    if (body.action === 'clear') {
      const removed = clearCompletedQueue(siteId);
      return NextResponse.json({ cleared: removed });
    }

    if (body.action === 'batch' && Array.isArray(body.articleWpIds)) {
      const added = addBatchToQueue(siteId, body.articleWpIds, {
        priority: body.priority || 'normal',
      });
      return NextResponse.json({ added: added.length, items: added });
    }

    if (!body.articleWpId) {
      return NextResponse.json({ error: '記事IDが必要です' }, { status: 400 });
    }

    const item = addToQueue(siteId, body.articleWpId, {
      priority: body.priority || 'normal',
    });

    if (!item) {
      return NextResponse.json({ error: 'この記事は既にキューに存在します' }, { status: 409 });
    }

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: キューアイテム削除
export async function DELETE(request, { params }) {
  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const queueId = searchParams.get('id');

    if (!queueId) {
      return NextResponse.json({ error: 'キューIDが必要です' }, { status: 400 });
    }

    const removed = removeFromQueue(siteId, queueId);
    if (!removed) {
      return NextResponse.json({ error: 'アイテムが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ removed: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
