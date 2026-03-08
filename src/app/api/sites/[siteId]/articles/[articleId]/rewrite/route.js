import { NextResponse } from 'next/server';
import { runRewritePipeline } from '@/rewrite-pipeline.js';

// POST /api/sites/:siteId/articles/:articleId/rewrite - リライト実行
export async function POST(request, { params }) {
  try {
    const { siteId, articleId } = await params;
    const body = await request.json().catch(() => ({}));
    const { dryRun = false, autoApply = false } = body;

    const result = await runRewritePipeline(siteId, parseInt(articleId, 10), {
      dryRun,
      autoApply,
    });

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
