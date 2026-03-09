import { NextResponse } from 'next/server';
import { getSite } from '@/site-manager.js';
import { WordPressClient } from '@/wordpress-client.js';
import { updateArticleStatus } from '@/article-fetcher.js';
import { getPipelineResult } from '@/rewrite-pipeline.js';
import { sanitizeForWordPress } from '@/gutenberg-converter.js';
import logger from '@/logger.js';

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
    const siteBaseUrl = site.url.replace(/\/+$/, '');

    // ★ WordPress送信前の最終サニタイズ ★
    logger.info(`apply: サニタイズ前コンテンツ長=${result.rewrittenContent?.length || 0}`);
    const cleanContent = sanitizeForWordPress(result.rewrittenContent);
    logger.info(`apply: サニタイズ後コンテンツ長=${cleanContent?.length || 0}`);

    if (status === 'draft') {
      // ★ 下書きとして保存（公開記事は非公開になる）★
      await client.updatePost(wpId, {
        content: cleanContent,
        status: 'draft',
      });

      updateArticleStatus(siteId, wpId, {
        rewriteStatus: 'draft',
        lastRewriteAt: new Date().toISOString(),
      });

      // WordPress管理画面の編集ページURL（プレビュー・公開可能）
      const editUrl = `${siteBaseUrl}/wp-admin/post.php?post=${wpId}&action=edit`;

      return NextResponse.json({
        success: true,
        postId: wpId,
        editUrl,
        siteUrl: siteBaseUrl,
        status: 'draft',
        message: '下書きとして保存しました。WordPress管理画面で確認・公開してください。',
      });
    }

    // ★ 直接公開（記事を更新）★
    const post = await client.updatePost(wpId, {
      content: cleanContent,
      status: 'publish',
    });

    updateArticleStatus(siteId, wpId, {
      rewriteStatus: 'rewritten',
      lastRewriteAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      postId: post.id,
      url: post.link,
      previewUrl: post.link,
      siteUrl: siteBaseUrl,
      status: 'publish',
      message: '記事を更新しました',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
