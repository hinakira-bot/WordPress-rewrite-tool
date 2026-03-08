import { NextResponse } from 'next/server';
import { getSite } from '@/site-manager.js';
import { WordPressClient } from '@/wordpress-client.js';
import { updateArticleStatus } from '@/article-fetcher.js';
import { getPipelineResult } from '@/rewrite-pipeline.js';

// POST /api/sites/:siteId/articles/:articleId/apply - リライト結果をWordPressに適用
export async function POST(request, { params }) {
  try {
    const { siteId, articleId } = await params;
    const wpId = parseInt(articleId, 10);
    const body = await request.json().catch(() => ({}));
    const { status = 'draft' } = body; // draft or publish

    const result = getPipelineResult(siteId, wpId);
    if (!result) {
      return NextResponse.json(
        { error: 'リライト結果がありません。先にリライトを実行してください。' },
        { status: 404 }
      );
    }

    const site = getSite(siteId);
    if (!site) {
      return NextResponse.json({ error: 'サイトが見つかりません' }, { status: 404 });
    }

    const client = new WordPressClient(site.url, site.username, site.appPassword);
    const post = await client.updatePost(wpId, {
      content: result.rewrittenContent,
      status,
    });

    updateArticleStatus(siteId, wpId, {
      rewriteStatus: status === 'publish' ? 'rewritten' : 'draft',
      lastRewriteAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      postId: post.id,
      url: post.link,
      status,
      message: status === 'publish' ? '記事を更新しました' : '下書きとして保存しました',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
