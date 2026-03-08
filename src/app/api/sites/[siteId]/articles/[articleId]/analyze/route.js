import { NextResponse } from 'next/server';
import { getArticle } from '@/article-fetcher.js';
import { checkFreshness } from '@/freshness-checker.js';

// POST /api/sites/:siteId/articles/:articleId/analyze - 最新情報調査
export async function POST(request, { params }) {
  try {
    const { siteId, articleId } = await params;
    const article = getArticle(siteId, articleId);

    if (!article) {
      return NextResponse.json({ error: '記事が見つかりません' }, { status: 404 });
    }

    const report = await checkFreshness(article, siteId);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
