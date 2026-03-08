import { NextResponse } from 'next/server';
import {
  startSingleRewrite,
  processQueue,
  autoRewrite,
  getStatus,
  resetPipeline,
} from '@/lib/pipeline-runner';

// GET: パイプラインステータス取得
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const status = getStatus(siteId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: パイプライン実行
export async function POST(request, { params }) {
  try {
    const { siteId } = await params;
    const body = await request.json();

    const { action } = body;

    switch (action) {
      case 'rewrite': {
        if (!body.articleWpId) {
          return NextResponse.json({ error: '記事IDが必要です' }, { status: 400 });
        }
        await startSingleRewrite(siteId, body.articleWpId, {
          dryRun: body.dryRun,
          triggeredBy: 'manual',
        });
        return NextResponse.json({ started: true, articleWpId: body.articleWpId });
      }

      case 'queue': {
        await processQueue(siteId, {
          maxArticles: body.maxArticles,
          triggeredBy: 'queue',
        });
        return NextResponse.json({ started: true, mode: 'queue' });
      }

      case 'auto': {
        await autoRewrite(siteId);
        return NextResponse.json({ started: true, mode: 'auto' });
      }

      case 'reset': {
        const result = resetPipeline(siteId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: '無効なアクション。rewrite, queue, auto, reset のいずれかを指定してください' },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
