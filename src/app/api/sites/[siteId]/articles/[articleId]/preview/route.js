import { NextResponse } from 'next/server';
import { getPipelineResult } from '@/rewrite-pipeline.js';

// GET /api/sites/:siteId/articles/:articleId/preview - リライトプレビュー取得
export async function GET(request, { params }) {
  try {
    const { siteId, articleId } = await params;
    const result = getPipelineResult(siteId, parseInt(articleId, 10));

    if (!result) {
      return NextResponse.json(
        { error: 'リライト結果がありません。先にリライトを実行してください。' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
