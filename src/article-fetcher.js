import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import * as cheerio from 'cheerio';
import config from './config.js';
import logger from './logger.js';
import { getSite, updateSiteStats, getSiteDataPath } from './site-manager.js';
import { WordPressClient } from './wordpress-client.js';

// ---------------------------------------------------------------------------
// Helper: 記事JSONパス
// ---------------------------------------------------------------------------

function getArticlesPath(siteId) {
  const siteDir = getSiteDataPath(siteId);
  return resolve(siteDir, 'articles.json');
}

// ---------------------------------------------------------------------------
// 記事キャッシュ読み込み
// ---------------------------------------------------------------------------

export function loadArticles(siteId) {
  const filePath = getArticlesPath(siteId);
  if (!existsSync(filePath)) {
    return { syncedAt: null, articles: [] };
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    logger.warn(`articles.json 読み込みエラー (${siteId}): ${err.message}`);
    return { syncedAt: null, articles: [] };
  }
}

// ---------------------------------------------------------------------------
// 記事キャッシュ保存
// ---------------------------------------------------------------------------

function saveArticles(siteId, data) {
  const filePath = getArticlesPath(siteId);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// HTML解析ヘルパー
// ---------------------------------------------------------------------------

function analyzeContent(rawHtml) {
  const $ = cheerio.load(rawHtml || '', { decodeEntities: false });

  // テキスト抽出 & 文字数カウント
  const text = $.text().replace(/\s+/g, ' ').trim();
  const wordCount = text.length;

  // 見出し数
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;

  // 画像数
  const imgCount = $('img').length;

  // リンク抽出
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const linkText = $(el).text().trim();
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ href, text: linkText });
    }
  });

  // FAQセクション有無
  const hasFaq = !!($('.swell-block-faq').length ||
    $('[class*="faq"]').length ||
    text.match(/よくある質問|FAQ|Q&A/i));

  return { wordCount, h2Count, h3Count, imgCount, links, hasFaq };
}

// ---------------------------------------------------------------------------
// WordPress記事を取得してキャッシュに保存
// ---------------------------------------------------------------------------

export async function syncArticles(siteId, onProgress) {
  const site = getSite(siteId);
  if (!site) throw new Error(`サイトが見つかりません: ${siteId}`);

  const client = new WordPressClient(site.url, site.username, site.appPassword);

  logger.info(`記事同期開始: ${site.name} (${site.url})`);
  onProgress?.({ message: `${site.name} の記事を取得中...` });

  const posts = await client.fetchAllPosts(onProgress);

  // 既存キャッシュと照合
  const existing = loadArticles(siteId);
  const existingMap = new Map(existing.articles.map((a) => [a.wpId, a]));

  const articles = posts.map((post) => {
    const prev = existingMap.get(post.id);
    const contentHtml = post.content?.rendered || '';
    const analysis = analyzeContent(contentHtml);

    return {
      wpId: post.id,
      title: post.title?.rendered || '',
      slug: post.slug || '',
      url: post.link || '',
      publishedAt: post.date || '',
      modifiedAt: post.modified || '',
      wordCount: analysis.wordCount,
      h2Count: analysis.h2Count,
      h3Count: analysis.h3Count,
      imgCount: analysis.imgCount,
      linkCount: analysis.links.length,
      hasFaq: analysis.hasFaq,
      hasExcerpt: !!(post.excerpt?.rendered?.replace(/<[^>]*>/g, '').trim()),
      excerptLength: (post.excerpt?.rendered?.replace(/<[^>]*>/g, '').trim() || '').length,
      categories: post.categories || [],
      tags: post.tags || [],
      content: contentHtml,
      // 前回のリライト情報を保持
      score: prev?.score ?? null,
      rewriteStatus: prev?.rewriteStatus || 'pending',
      lastRewriteAt: prev?.lastRewriteAt || null,
      lastAnalyzedAt: prev?.lastAnalyzedAt || null,
    };
  });

  const data = {
    syncedAt: new Date().toISOString(),
    articles,
  };

  saveArticles(siteId, data);

  // サイト統計更新
  updateSiteStats(siteId, {
    lastSyncAt: data.syncedAt,
    articleCount: articles.length,
    rewrittenCount: articles.filter((a) => a.rewriteStatus === 'rewritten').length,
  });

  logger.info(`記事同期完了: ${articles.length}件`);
  onProgress?.({ message: `同期完了: ${articles.length}件の記事を取得しました` });

  return data;
}

// ---------------------------------------------------------------------------
// 単一記事取得（キャッシュから）
// ---------------------------------------------------------------------------

export function getArticle(siteId, articleId) {
  const { articles } = loadArticles(siteId);
  const wpId = parseInt(articleId, 10);
  return articles.find((a) => a.wpId === wpId) || null;
}

// ---------------------------------------------------------------------------
// 記事ステータス更新
// ---------------------------------------------------------------------------

export function updateArticleStatus(siteId, articleWpId, updates) {
  const data = loadArticles(siteId);
  const article = data.articles.find((a) => a.wpId === articleWpId);
  if (!article) return;

  Object.assign(article, updates);
  saveArticles(siteId, data);
}
