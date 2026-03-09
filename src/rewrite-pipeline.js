import logger from './logger.js';
import { getArticle, updateArticleStatus, loadArticles } from './article-fetcher.js';
import { getSite } from './site-manager.js';
import { WordPressClient } from './wordpress-client.js';
import { checkFreshness, researchExternalLinks } from './freshness-checker.js';
import { auditInternalLinks, auditExternalLinks } from './link-manager.js';
import { generateRewrite } from './rewrite-generator.js';
import { generateDiff } from './diff-generator.js';
import { loadSiteSettings } from './settings-manager.js';
import { postProcessContent, validateLinks, sanitizeForWordPress } from './gutenberg-converter.js';

// ---------------------------------------------------------------------------
// リライトパイプライン（8ステップ）
// ---------------------------------------------------------------------------

export async function runRewritePipeline(siteId, articleWpId, options = {}) {
  const startTime = Date.now();
  const onProgress = options.onProgress;

  logger.info('========================================');
  logger.info('  リライトパイプライン開始');
  logger.info(`  サイト: ${siteId}, 記事ID: ${articleWpId}`);
  logger.info('========================================');

  try {
    // --- Step 0: 準備 ---
    const article = getArticle(siteId, articleWpId);
    if (!article) throw new Error(`記事が見つかりません: ${articleWpId}`);

    const site = getSite(siteId);
    if (!site) throw new Error(`サイトが見つかりません: ${siteId}`);

    const settings = loadSiteSettings(siteId);

    updateArticleStatus(siteId, articleWpId, { rewriteStatus: 'processing' });
    onProgress?.({ step: 0, total: 8, message: `リライト開始: "${article.title}"` });

    // --- Step 1: コンテンツ解析 ---
    onProgress?.({ step: 1, total: 8, message: 'Step 1/8: 記事コンテンツを解析中...' });
    logger.info('Step 1: コンテンツ解析');

    // --- Step 2: 最新情報の徹底調査（★最重要★） ---
    onProgress?.({ step: 2, total: 8, message: 'Step 2/8: 最新情報を調査中（最重要）...' });
    logger.info('Step 2: 最新情報調査');
    const freshnessReport = await checkFreshness(article, siteId, onProgress);

    // --- Step 3: 内部リンク調査 ---
    onProgress?.({ step: 3, total: 8, message: 'Step 3/8: 内部リンクを調査中...' });
    logger.info('Step 3: 内部リンク調査');
    const internalLinkAudit = await auditInternalLinks(article, siteId, onProgress);

    // --- Step 4: 外部リンク調査 ---
    onProgress?.({ step: 4, total: 8, message: 'Step 4/8: 外部リンクを調査中...' });
    logger.info('Step 4: 外部リンク調査');
    const externalLinkAudit = await auditExternalLinks(article, siteId, onProgress);
    const externalLinkResearch = await researchExternalLinks(article, siteId, onProgress);

    // --- Step 5: リライト生成（FAQ含む） ---
    const rewriteMode = settings.rewrite?.defaultMode || 'minimal';
    const linkStyle = settings.content?.linkStyle || 'text';
    onProgress?.({ step: 5, total: 8, message: `Step 5/8: リライト記事を生成中（${rewriteMode}モード）...` });
    logger.info(`Step 5: リライト生成（モード: ${rewriteMode}, リンクスタイル: ${linkStyle}）`);
    const rewriteResult = await generateRewrite({
      article: { ...article, linkStyle },
      freshnessReport,
      internalLinkAudit,
      externalLinkAudit,
      externalLinkResearch,
      siteId,
      rewriteMode,
      onProgress,
    });

    // --- Step 5.5: Post-Processing（SWELL変換 + Gutenbergブロック化 + リンク検証） ---
    onProgress?.({ step: 5, total: 8, message: 'Step 5/8: SWELL装飾変換 & リンク検証中...' });
    logger.info('Step 5.5: Post-Processing');

    // SWELL装飾変換 + Gutenbergブロック化
    let processedContent = postProcessContent(rewriteResult.content, settings);

    // リンク検証（ホワイトリスト照合）
    const { articles: allArticles } = loadArticles(siteId);
    const articleIndex = allArticles.map((a) => ({ url: a.url, title: a.title }));
    const linkValidation = await validateLinks(processedContent, site.url, articleIndex);
    processedContent = linkValidation.html;

    if (linkValidation.removedLinks.length > 0) {
      logger.info(`リンク検証: ${linkValidation.removedLinks.length}件の不正リンクを除去`);
    }

    rewriteResult.content = processedContent;
    rewriteResult.postProcessing = {
      swellConverted: true,
      gutenbergConverted: true,
      removedLinks: linkValidation.removedLinks,
    };

    // --- Step 6: 差分生成 ---
    onProgress?.({ step: 6, total: 8, message: 'Step 6/8: 差分を生成中...' });
    logger.info('Step 6: 差分生成');
    const diff = generateDiff(article.content, rewriteResult.content);

    // --- Step 7: プレビュー用データ保存 ---
    onProgress?.({ step: 7, total: 8, message: 'Step 7/8: プレビューデータを保存中...' });
    logger.info('Step 7: プレビュー保存');

    const previewData = {
      articleWpId,
      title: article.title,
      originalContent: article.content,
      rewrittenContent: rewriteResult.content,
      freshnessReport,
      internalLinkAudit,
      externalLinkAudit,
      externalLinkResearch,
      diff,
      createdAt: new Date().toISOString(),
    };

    // メモリ上に保持（後でAPIから取得）
    savePipelineResult(siteId, articleWpId, previewData);

    // --- Step 8: WordPress更新（設定による） ---
    const updateMethod = settings.rewrite?.updateMethod || 'draft';

    if (options.dryRun) {
      onProgress?.({ step: 8, total: 8, message: 'Step 8/8: ドライラン完了（WordPress更新スキップ）' });
      logger.info('Step 8: ドライラン - WordPress更新スキップ');
    } else if (options.autoApply || updateMethod === 'publish') {
      onProgress?.({ step: 8, total: 8, message: 'Step 8/8: WordPressに記事を更新中...' });
      logger.info('Step 8: WordPress更新（直接上書き）');

      // ★ 直接公開時も最終サニタイズを適用 ★
      const finalContent = sanitizeForWordPress(rewriteResult.content);

      const client = new WordPressClient(site.url, site.username, site.appPassword);
      await client.updatePost(articleWpId, {
        content: finalContent,
        status: 'publish',
      });

      updateArticleStatus(siteId, articleWpId, {
        rewriteStatus: 'rewritten',
        lastRewriteAt: new Date().toISOString(),
      });
    } else {
      onProgress?.({ step: 8, total: 8, message: 'Step 8/8: 下書きとして保存完了。ダッシュボードで確認してください。' });
      logger.info('Step 8: 下書き保存モード - ユーザー承認待ち');

      updateArticleStatus(siteId, articleWpId, {
        rewriteStatus: 'draft',
        lastRewriteAt: new Date().toISOString(),
      });
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.info('========================================');
    logger.info(`  リライトパイプライン完了! (${elapsed}秒)`);
    logger.info('========================================');

    onProgress?.({ step: 8, total: 8, message: `完了! (${elapsed}秒)`, done: true });

    return {
      success: true,
      articleWpId,
      title: article.title,
      elapsed,
      freshnessReport,
      diff,
      updateMethod: options.dryRun ? 'dryrun' : updateMethod,
    };

  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.error(`リライトパイプライン失敗 (${elapsed}秒): ${err.message}`);

    updateArticleStatus(siteId, articleWpId, { rewriteStatus: 'failed' });

    onProgress?.({ step: -1, message: `エラー: ${err.message}`, done: true, error: true });

    return {
      success: false,
      error: err.message,
      articleWpId,
      elapsed,
    };
  }
}

// ---------------------------------------------------------------------------
// パイプライン結果のメモリキャッシュ
// ---------------------------------------------------------------------------

const pipelineResults = new Map();

function savePipelineResult(siteId, articleWpId, data) {
  const key = `${siteId}:${articleWpId}`;
  pipelineResults.set(key, data);
}

export function getPipelineResult(siteId, articleWpId) {
  const key = `${siteId}:${articleWpId}`;
  return pipelineResults.get(key) || null;
}

