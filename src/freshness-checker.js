import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import config from './config.js';
import logger from './logger.js';
import { loadPrompt, renderPrompt } from './prompt-manager.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function withTimeout(promise, ms, label = 'API') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} タイムアウト (${ms / 1000}秒)`)), ms)
    ),
  ]);
}

async function generateWithRetry(model, prompt, { timeoutMs = 120_000, label = 'API' } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), timeoutMs, label);
      return result;
    } catch (err) {
      logger.warn(`${label} 失敗 (試行${attempt}/2): ${err.message}`);
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    logger.warn('JSON解析失敗、テキストとして返却');
    return { raw: cleaned };
  }
}

// ---------------------------------------------------------------------------
// 記事から情報要素を抽出
// ---------------------------------------------------------------------------

export function extractFactualClaims(contentHtml) {
  const $ = cheerio.load(contentHtml || '', { decodeEntities: false });
  const text = $.text();

  const claims = [];

  // 料金・価格パターン
  const pricePatterns = [
    /(?:月額|年額|料金|価格|プラン)[\s:：]*[￥$¥]?[\d,]+円?/g,
    /(?:\$|USD)\s*[\d,.]+/g,
    /(?:無料|フリー)(?:プラン|版)?/g,
    /(?:有料|プレミアム|プロ|エンタープライズ)(?:プラン|版)?/g,
  ];

  // モデル名パターン
  const modelPatterns = [
    /(?:GPT-[\w.]+|Claude[\s-]?[\w.]*|Gemini[\s-]?[\w.]*|DALL-E[\s-]?[\w.]*|Midjourney[\s-]?[\w.]*)/g,
    /(?:gpt-[\w.-]+|claude-[\w.-]+|gemini-[\w.-]+)/g,
  ];

  // ツール・サービス名パターン
  const toolPatterns = [
    /(?:ChatGPT|OpenAI|Anthropic|Google AI|Microsoft Copilot|Notion AI|Jasper|Copy\.ai)/gi,
    /(?:WordPress|Shopify|Wix|Squarespace|ConoHa|Xserver|mixhost)/gi,
  ];

  // パターンマッチで情報要素を抽出
  for (const pattern of [...pricePatterns, ...modelPatterns, ...toolPatterns]) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of [...new Set(matches)]) {
        claims.push(m.trim());
      }
    }
  }

  return [...new Set(claims)];
}

// ---------------------------------------------------------------------------
// 最新情報調査（★最重要★）- 3フェーズ方式
// Phase 1: 競合記事分析（上位記事が何を書いているか）
// Phase 2: 記事内情報の検証（JA+EN並列）
// Phase 3: 最新ニュース・公式発表の調査
// ---------------------------------------------------------------------------

export async function checkFreshness(article, siteId, onProgress) {
  logger.info(`最新情報調査開始: "${article.title}"`);
  onProgress?.({ message: '最新情報を調査中（3フェーズ）...' });

  const claims = extractFactualClaims(article.content);
  logger.info(`抽出した情報要素: ${claims.length}件`);

  const model = genAI.getGenerativeModel({
    model: config.gemini.textModel,
    tools: [{ googleSearch: {} }],
  });

  const keyword = extractKeyword(article.title);
  logger.info(`抽出キーワード: "${keyword}"`);

  // === Phase 1: 競合記事分析 ===
  onProgress?.({ message: 'Phase 1/3: 競合上位記事を分析中...' });
  let competitorAnalysis = {};
  try {
    const compResult = await generateWithRetry(model, getCompetitorAnalysisPrompt(keyword, article), {
      timeoutMs: 180_000,
      label: '競合記事分析',
    });
    competitorAnalysis = parseJSON(compResult.response.text());
    logger.info(`競合分析完了: ${competitorAnalysis.topArticles?.length || 0}件の上位記事`);
  } catch (err) {
    logger.warn(`競合分析失敗: ${err.message}`);
  }

  // === Phase 2: 記事内情報の検証（JA+EN並列）===
  onProgress?.({ message: 'Phase 2/3: 記事内の情報を最新データと照合中（JA+EN並列）...' });

  let template;
  try {
    template = loadPrompt('freshness-check', siteId);
  } catch {
    template = getDefaultFreshnessPrompt();
  }

  const competitorInsights = formatCompetitorInsights(competitorAnalysis);
  const prompt = renderPrompt(template, {
    title: article.title,
    url: article.url,
    claims: claims.join('\n- '),
    content: article.content?.substring(0, 8000) || '',
  }) + (competitorInsights ? `\n\n${competitorInsights}` : '');

  const [jaResult, enResult] = await Promise.allSettled([
    generateWithRetry(model, prompt, { timeoutMs: 180_000, label: '情報検証(JA)' }),
    generateWithRetry(model, getEnglishFreshnessPrompt(article, claims), { timeoutMs: 180_000, label: '情報検証(EN)' }),
  ]);

  const jaParsed = jaResult.status === 'fulfilled' ? parseJSON(jaResult.value.response.text()) : {};
  const enParsed = enResult.status === 'fulfilled' ? parseJSON(enResult.value.response.text()) : {};

  // === Phase 3: 最新ニュース・公式発表の調査 ===
  onProgress?.({ message: 'Phase 3/3: 最新ニュース・公式発表を調査中...' });
  let latestNews = {};
  try {
    const newsResult = await generateWithRetry(model, getLatestNewsPrompt(keyword, article), {
      timeoutMs: 180_000,
      label: '最新ニュース調査',
    });
    latestNews = parseJSON(newsResult.response.text());
    logger.info(`最新ニュース完了: ${latestNews.latestUpdates?.length || 0}件`);
  } catch (err) {
    logger.warn(`最新ニュース調査失敗: ${err.message}`);
  }

  // === 全結果をマージ ===
  const mergedFactChecks = mergeFactChecks(jaParsed.factChecks || [], enParsed.factChecks || []);
  const mergedNewInfo = mergeNewInfo(jaParsed.newInfo || [], enParsed.newInfo || []);

  // 競合記事のギャップ情報を追加
  for (const topic of (competitorAnalysis.missingTopics || [])) {
    if (!mergedNewInfo.some((i) => i.topic === topic.topic)) {
      mergedNewInfo.push({ topic: topic.topic, description: topic.description || '競合上位記事でカバー済み', source: topic.source || '競合分析', region: 'competitor' });
    }
  }

  // 最新ニュースを追加
  for (const update of (latestNews.latestUpdates || [])) {
    if (!mergedNewInfo.some((i) => i.topic === update.topic)) {
      mergedNewInfo.push({ topic: update.topic, description: update.description, source: update.source || '最新ニュース', region: 'news' });
    }
  }

  // バージョン更新をfactChecksに追加
  for (const vu of (latestNews.versionUpdates || [])) {
    if (!mergedFactChecks.some((fc) => fc.current === vu.newVersion || fc.current === vu.latestVersion)) {
      mergedFactChecks.push({
        original: vu.oldVersion || vu.service,
        current: vu.newVersion || vu.latestVersion,
        changed: true,
        changeType: 'model_update',
        source: vu.source || '最新ニュース',
        importance: 'high',
        region: 'news',
      });
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    totalClaims: claims.length,
    factChecks: mergedFactChecks,
    outdatedCount: mergedFactChecks.filter((f) => f.changed).length,
    newInfo: mergedNewInfo,
    summary: jaParsed.summary || enParsed.summary || '',
    recommendations: [
      ...(jaParsed.recommendations || []),
      ...(enParsed.recommendations || []).filter((r) => !(jaParsed.recommendations || []).some((jr) => jr.includes(r.substring(0, 10)))),
      ...(competitorAnalysis.recommendations || []),
      ...(latestNews.recommendations || []),
    ],
    competitorAnalysis: { topArticles: competitorAnalysis.topArticles || [], missingTopics: competitorAnalysis.missingTopics || [] },
    latestNews: { updates: latestNews.latestUpdates || [], versionUpdates: latestNews.versionUpdates || [] },
    searchLanguages: { ja: jaResult.status === 'fulfilled', en: enResult.status === 'fulfilled' },
  };

  logger.info(`最新情報調査完了: ${report.outdatedCount}件の更新, ${report.newInfo.length}件の新情報`);
  onProgress?.({ message: `調査完了: ${report.outdatedCount}件の更新必要, ${report.newInfo.length}件の新情報` });

  return report;
}

// ---------------------------------------------------------------------------
// キーワード抽出
// ---------------------------------------------------------------------------

function extractKeyword(title) {
  return title
    .replace(/【[^】]*】/g, '').replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '')
    .replace(/\d{4}年[最新版]*|最新版|\d+選|徹底|完全|保存版/g, '')
    .replace(/の(使い方|始め方|やり方|選び方|比較|まとめ|レビュー|評判|口コミ)/g, ' $1')
    .trim().substring(0, 30);
}

// ---------------------------------------------------------------------------
// Phase 1: 競合記事分析プロンプト
// ---------------------------------------------------------------------------

function getCompetitorAnalysisPrompt(keyword, article) {
  const h2s = extractH2Headings(article.content);
  return `あなたはSEO競合分析の専門家です。「${keyword}」でGoogle検索上位の記事を調査し、自記事と比較してください。

## 自記事タイトル: ${article.title}
## 自記事のH2見出し:
${h2s.map((h) => `- ${h}`).join('\n') || '不明'}

## 調査指示
1. 「${keyword}」で検索し、上位5〜10記事のタイトル・構成を調査
2. 上位記事がカバーしていて自記事に**ないトピック**を特定
3. 上位記事で使われている**最新のバージョン・料金・サービス情報**を収集

## 出力（JSON）
{
  "topArticles": [{ "title": "記事タイトル", "url": "URL", "keyTopics": ["トピック"], "latestInfo": "最新情報" }],
  "missingTopics": [{ "topic": "不足トピック", "description": "重要な理由", "source": "参考URL" }],
  "latestVersions": [{ "service": "サービス名", "currentVersion": "最新バージョン/情報", "source": "URL" }],
  "recommendations": ["改善提案"]
}`;
}

// ---------------------------------------------------------------------------
// Phase 3: 最新ニュース・公式発表プロンプト
// ---------------------------------------------------------------------------

function getLatestNewsPrompt(keyword, article) {
  const services = extractServiceNames(article.content);
  return `あなたは最新テクノロジーニュースの専門家です。以下のサービス・ツールの**直近3ヶ月の公式発表・アップデート**を徹底調査してください。

## 記事タイトル: ${article.title}
## 記事内のサービス:
${services.map((s) => `- ${s}`).join('\n') || '不明'}
## キーワード: 「${keyword}」

## 調査指示（★重要★）
1. 各サービスの**公式サイト・ブログ**で直近3ヶ月のアップデートを検索
2. 特に重点調査:
   - **最新バージョン・モデル名**（例: GPTの最新は? Claudeの最新は? Geminiの最新は?）
   - **料金改定**（値上げ・値下げ・新プラン追加）
   - **新機能リリース**
   - **サービス統合・名称変更・終了**
3. テック系ニュースサイト（TechCrunch, The Verge, ITmedia, GIGAZINE等）も検索
4. **日付とソースURL**を必ず含めること

## 出力（JSON）
{
  "latestUpdates": [{ "topic": "トピック", "description": "詳細", "date": "YYYY-MM-DD", "source": "URL" }],
  "versionUpdates": [{ "service": "サービス名", "oldVersion": "旧バージョン", "newVersion": "最新バージョン", "latestVersion": "最新名", "releaseDate": "日付", "source": "URL" }],
  "pricingChanges": [{ "service": "サービス名", "oldPrice": "旧料金", "newPrice": "新料金", "source": "URL" }],
  "recommendations": ["推奨アクション"]
}`;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function extractH2Headings(html) {
  if (!html) return [];
  const $ = cheerio.load(html, { decodeEntities: false });
  const headings = [];
  $('h2').each((_, el) => headings.push($(el).text().trim()));
  return headings;
}

function extractServiceNames(html) {
  if (!html) return [];
  const text = cheerio.load(html, { decodeEntities: false }).text();
  const services = new Set();
  const patterns = [
    /(?:ChatGPT|GPT-[\w.]+|OpenAI)/gi, /(?:Claude[\s-]?[\w.]*|Anthropic)/gi,
    /(?:Gemini[\s-]?[\w.]*|Google AI|Google Bard)/gi, /(?:Midjourney|DALL-E[\s-]?[\w.]*|Stable Diffusion)/gi,
    /(?:Microsoft Copilot|GitHub Copilot|Notion AI|Jasper|Copy\.ai|Perplexity)/gi,
    /(?:WordPress|Shopify|Wix|Squarespace)/gi, /(?:ConoHa|Xserver|mixhost)/gi,
    /(?:AWS|Azure|GCP|Vercel|Netlify|Cloudflare)/gi,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) m.forEach((s) => services.add(s.trim())); }
  return [...services];
}

function formatCompetitorInsights(analysis) {
  if (!analysis?.topArticles?.length && !analysis?.missingTopics?.length) return '';
  const lines = ['## 競合上位記事からの情報'];
  if (analysis.latestVersions?.length > 0) {
    lines.push('\n### 上位記事の最新情報:');
    for (const v of analysis.latestVersions) lines.push(`- ${v.service}: ${v.currentVersion} (${v.source || '上位記事'})`);
  }
  if (analysis.missingTopics?.length > 0) {
    lines.push('\n### 自記事に不足するトピック:');
    for (const t of analysis.missingTopics) lines.push(`- ${t.topic}: ${t.description}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 英語ソース検索用プロンプト
// ---------------------------------------------------------------------------

function getEnglishFreshnessPrompt(article, claims) {
  return `You are a fact-checking expert. Search English-language sources (official sites, TechCrunch, The Verge, Ars Technica, Wired, official documentation) to verify the following claims from a Japanese blog article.

## Article Title
${article.title}

## Claims to Verify
${claims.map((c) => `- ${c}`).join('\n')}

## Article Content (excerpt)
${article.content?.substring(0, 5000) || ''}

## Instructions
1. Search for the latest English-language information about each claim
2. Focus on official announcements, pricing pages, and tech news from the last 3 months
3. Look for information that Japanese sources may not have covered yet
4. Output ALL results in Japanese

## Output Format (JSON)
{
  "factChecks": [
    {
      "original": "記事内の記述（日本語）",
      "current": "英語ソースで確認した最新情報（日本語で記述）",
      "changed": true,
      "changeType": "price_change | model_update | service_discontinued | name_change | feature_added | info_outdated",
      "source": "情報源URL",
      "importance": "high | medium | low",
      "region": "en"
    }
  ],
  "newInfo": [
    {
      "topic": "新しい情報のトピック（日本語）",
      "description": "詳細な説明（日本語）",
      "source": "英語ソースURL",
      "region": "en"
    }
  ],
  "recommendations": ["推奨アクション（日本語）"]
}`;
}

// ---------------------------------------------------------------------------
// 結果マージユーティリティ
// ---------------------------------------------------------------------------

function mergeFactChecks(jaChecks, enChecks) {
  const merged = [...jaChecks.map((c) => ({ ...c, region: c.region || 'ja' }))];

  for (const enCheck of enChecks) {
    const isDuplicate = merged.some(
      (m) => m.original === enCheck.original ||
        (m.changeType === enCheck.changeType && m.current === enCheck.current)
    );
    if (!isDuplicate) {
      merged.push({ ...enCheck, region: 'en' });
    }
  }

  return merged;
}

function mergeNewInfo(jaInfo, enInfo) {
  const merged = [...jaInfo.map((i) => ({ ...i, region: i.region || 'ja' }))];

  for (const enItem of enInfo) {
    const isDuplicate = merged.some(
      (m) => m.topic === enItem.topic ||
        (m.description && enItem.description && m.description.substring(0, 30) === enItem.description.substring(0, 30))
    );
    if (!isDuplicate) {
      merged.push({ ...enItem, region: 'en' });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// 外部リンク調査
// ---------------------------------------------------------------------------

export async function researchExternalLinks(article, siteId, onProgress) {
  logger.info(`外部リンク調査: "${article.title}"`);
  onProgress?.({ message: '信頼性の高い外部ソースを調査中...' });

  const model = genAI.getGenerativeModel({
    model: config.gemini.textModel,
    tools: [{ googleSearch: {} }],
  });

  let template;
  try {
    template = loadPrompt('external-link-research', siteId);
  } catch {
    template = getDefaultExternalLinkPrompt();
  }

  const prompt = renderPrompt(template, {
    title: article.title,
    content: article.content?.substring(0, 5000) || '',
  });

  const result = await generateWithRetry(model, prompt, {
    timeoutMs: 120_000,
    label: '外部リンク調査',
  });

  const text = result.response.text();
  const parsed = parseJSON(text);

  return {
    suggestedLinks: parsed.suggestedLinks || [],
    officialSources: parsed.officialSources || [],
  };
}

// ---------------------------------------------------------------------------
// デフォルトプロンプト
// ---------------------------------------------------------------------------

function getDefaultFreshnessPrompt() {
  return `あなたは情報の鮮度を検証する専門家です。以下のブログ記事の内容が最新かどうかを徹底的に調査してください。

## 調査対象記事
タイトル: {{title}}
URL: {{url}}

## 記事内で言及されている情報
{{claims}}

## 記事本文（冒頭部分）
{{content}}

## 調査指示
1. 記事内のツール名・サービス名・料金・プラン名・モデル名が最新かを1つずつ検証してください
2. サービスの終了・名称変更・統合がないか確認してください
3. 新機能・新プランの追加情報がないか確認してください
4. 統計データや数値が最新かどうか確認してください

## 出力形式（JSON）
{
  "factChecks": [
    {
      "original": "記事内の記述",
      "current": "最新の正しい情報",
      "changed": true,
      "changeType": "price_change | model_update | service_discontinued | name_change | feature_added | info_outdated",
      "source": "情報源URL",
      "importance": "high | medium | low"
    }
  ],
  "newInfo": [
    {
      "topic": "新しい情報のトピック",
      "description": "詳細な説明",
      "source": "情報源URL"
    }
  ],
  "summary": "調査結果の要約（日本語）",
  "recommendations": ["推奨アクション1", "推奨アクション2"]
}`;
}

function getDefaultExternalLinkPrompt() {
  return `以下のブログ記事のテーマに関連する、信頼性の高い外部ソースを調査してください。

## 記事タイトル
{{title}}

## 記事本文（冒頭部分）
{{content}}

## 調査指示
- 公式サイト・公式ドキュメントのURL
- 統計データ・調査レポートのURL
- 権威ある情報源のURL
を探してください。

## 出力形式（JSON）
{
  "suggestedLinks": [
    {
      "url": "https://...",
      "title": "リンクテキスト",
      "reason": "なぜこのリンクが有用か",
      "insertLocation": "記事内のどこに挿入すべきか"
    }
  ],
  "officialSources": [
    {
      "serviceName": "サービス名",
      "officialUrl": "公式サイトURL",
      "pricingUrl": "料金ページURL",
      "docUrl": "ドキュメントURL"
    }
  ]
}`;
}
