import { NextResponse } from 'next/server';
import { loadArticles } from '@/article-fetcher.js';
import { scoreAllArticles } from '@/article-scorer.js';

// GET /api/sites/:siteId/articles - 記事一覧（スコア付き）
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);

    const sort = searchParams.get('sort') || 'score'; // score, date, title, wordCount
    const order = searchParams.get('order') || 'desc';
    const status = searchParams.get('status'); // pending, rewritten, all
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('perPage') || '50', 10);

    const data = loadArticles(siteId);

    if (!data.articles.length) {
      return NextResponse.json({
        syncedAt: data.syncedAt,
        articles: [],
        total: 0,
        page,
        totalPages: 0,
      });
    }

    // スコアリング
    let articles = scoreAllArticles(data.articles);

    // フィルター: ステータス
    if (status && status !== 'all') {
      articles = articles.filter((a) => a.rewriteStatus === status);
    }

    // フィルター: 検索
    if (search) {
      const q = search.toLowerCase();
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q)
      );
    }

    // ソート
    articles.sort((a, b) => {
      let va, vb;
      switch (sort) {
        case 'score':
          va = a.score || 0;
          vb = b.score || 0;
          break;
        case 'date':
          va = new Date(a.modifiedAt || a.publishedAt).getTime();
          vb = new Date(b.modifiedAt || b.publishedAt).getTime();
          break;
        case 'title':
          va = a.title;
          vb = b.title;
          break;
        case 'wordCount':
          va = a.wordCount || 0;
          vb = b.wordCount || 0;
          break;
        default:
          va = a.score || 0;
          vb = b.score || 0;
      }
      if (order === 'asc') return va > vb ? 1 : -1;
      return va < vb ? 1 : -1;
    });

    // ページネーション
    const total = articles.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const paged = articles.slice(start, start + perPage);

    // content フィールドを除外（一覧では不要）
    const light = paged.map(({ content, ...rest }) => rest);

    return NextResponse.json({
      syncedAt: data.syncedAt,
      articles: light,
      total,
      page,
      totalPages,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
