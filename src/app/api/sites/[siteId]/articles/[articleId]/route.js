import { NextResponse } from 'next/server';
import { getArticle } from '@/article-fetcher.js';
import { scoreArticle } from '@/article-scorer.js';

// GET /api/sites/:siteId/articles/:articleId - 記事詳細
export async function GET(request, { params }) {
  try {
    const { siteId, articleId } = await params;
    const article = getArticle(siteId, articleId);

    if (!article) {
      return NextResponse.json({ error: '記事が見つかりません' }, { status: 404 });
    }

    const scoreResult = scoreArticle(article);

    return NextResponse.json({
      ...article,
      score: scoreResult.score,
      scoreGrade: scoreResult.grade,
      scoreDetails: scoreResult.details,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
