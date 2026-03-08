import * as cheerio from 'cheerio';
import logger from './logger.js';
import { getSite } from './site-manager.js';
import { WordPressClient } from './wordpress-client.js';
import { loadArticles } from './article-fetcher.js';

// ---------------------------------------------------------------------------
// 記事内のリンクを抽出
// ---------------------------------------------------------------------------

export function extractLinks(contentHtml, siteUrl) {
  const $ = cheerio.load(contentHtml || '', { decodeEntities: false });
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '').toLowerCase();

  const internal = [];
  const external = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();

    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }

    try {
      const url = new URL(href, siteUrl);
      const fullUrl = url.href;

      if (fullUrl.toLowerCase().startsWith(normalizedSiteUrl)) {
        internal.push({ href: fullUrl, text, original: href });
      } else {
        external.push({ href: fullUrl, text, original: href });
      }
    } catch {
      // 相対URLの場合
      if (href.startsWith('/')) {
        internal.push({ href: `${siteUrl}${href}`, text, original: href });
      } else {
        external.push({ href, text, original: href });
      }
    }
  });

  return { internal, external };
}

// ---------------------------------------------------------------------------
// 内部リンク調査
// ---------------------------------------------------------------------------

export async function auditInternalLinks(article, siteId, onProgress) {
  const site = getSite(siteId);
  if (!site) throw new Error(`サイトが見つかりません: ${siteId}`);

  logger.info(`内部リンク調査: "${article.title}"`);
  onProgress?.({ message: '内部リンクを調査中...' });

  const { internal } = extractLinks(article.content, site.url);

  // サイト内全記事インデックスを取得（キャッシュから）
  const { articles: allArticles } = loadArticles(siteId);
  const articleIndex = allArticles.map((a) => ({
    wpId: a.wpId,
    title: a.title,
    url: a.url,
    slug: a.slug,
    categories: a.categories,
  }));

  // 内部リンクの存在チェック
  const linkResults = [];
  const client = new WordPressClient(site.url, site.username, site.appPassword);

  for (const link of internal) {
    const existsInIndex = articleIndex.some(
      (a) => a.url === link.href || link.href.includes(a.slug)
    );

    if (existsInIndex) {
      linkResults.push({ ...link, status: 'alive', action: 'keep' });
    } else {
      // URLの生存確認
      const check = await client.checkUrlAlive(link.href);
      if (check.alive) {
        linkResults.push({ ...link, status: 'alive', action: 'keep' });
      } else {
        // 404 → 代替記事を提案
        const suggestion = findRelatedArticle(link.text, articleIndex);
        linkResults.push({
          ...link,
          status: 'dead',
          httpStatus: check.status,
          action: suggestion ? 'replace' : 'remove',
          suggestion,
        });
      }
      // レートリミット対策
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // 関連記事への追加リンク候補
  const linkedUrls = new Set(internal.map((l) => l.href));
  const suggestedLinks = articleIndex
    .filter((a) => a.wpId !== article.wpId && !linkedUrls.has(a.url))
    .filter((a) => {
      // カテゴリが同じ記事を候補として提案
      const hasCommonCategory = a.categories?.some((c) =>
        article.categories?.includes(c)
      );
      return hasCommonCategory;
    })
    .slice(0, 5)
    .map((a) => ({
      url: a.url,
      title: a.title,
      reason: '同じカテゴリの関連記事',
    }));

  const deadLinks = linkResults.filter((l) => l.status === 'dead').length;
  logger.info(`内部リンク調査完了: ${internal.length}件中 ${deadLinks}件のリンク切れ`);
  onProgress?.({ message: `内部リンク: ${deadLinks}件のリンク切れ、${suggestedLinks.length}件の追加候補` });

  return {
    existing: linkResults,
    deadCount: deadLinks,
    suggestedAdditions: suggestedLinks,
  };
}

// ---------------------------------------------------------------------------
// 外部リンク生存確認
// ---------------------------------------------------------------------------

export async function auditExternalLinks(article, siteId, onProgress) {
  const site = getSite(siteId);
  if (!site) throw new Error(`サイトが見つかりません: ${siteId}`);

  logger.info(`外部リンク調査: "${article.title}"`);
  onProgress?.({ message: '外部リンクを確認中...' });

  const { external } = extractLinks(article.content, site.url);
  const client = new WordPressClient(site.url, site.username, site.appPassword);

  const results = [];
  for (const link of external) {
    const check = await client.checkUrlAlive(link.href);
    results.push({
      ...link,
      status: check.alive ? 'alive' : 'dead',
      httpStatus: check.status,
      redirected: check.redirected,
      finalUrl: check.finalUrl,
      action: check.alive ? 'keep' : 'remove',
    });
    await new Promise((r) => setTimeout(r, 300));
  }

  const deadLinks = results.filter((l) => l.status === 'dead').length;
  logger.info(`外部リンク調査完了: ${external.length}件中 ${deadLinks}件のリンク切れ`);
  onProgress?.({ message: `外部リンク: ${deadLinks}件のリンク切れを検出` });

  return {
    existing: results,
    deadCount: deadLinks,
  };
}

// ---------------------------------------------------------------------------
// Helper: 関連記事を探す
// ---------------------------------------------------------------------------

function findRelatedArticle(linkText, articleIndex) {
  if (!linkText) return null;

  const textLower = linkText.toLowerCase();

  // タイトルに部分一致する記事を探す
  const match = articleIndex.find((a) =>
    a.title.toLowerCase().includes(textLower) ||
    textLower.includes(a.title.toLowerCase().substring(0, 10))
  );

  if (match) {
    return { url: match.url, title: match.title };
  }

  return null;
}
