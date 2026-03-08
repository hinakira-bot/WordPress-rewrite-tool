import { NextResponse } from 'next/server';
import { syncArticles } from '@/article-fetcher.js';

// POST /api/sites/:siteId/sync - 記事同期
export async function POST(request, { params }) {
  try {
    const { siteId } = await params;
    const data = await syncArticles(siteId);
    return NextResponse.json({
      message: `${data.articles.length}件の記事を同期しました`,
      syncedAt: data.syncedAt,
      articleCount: data.articles.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
