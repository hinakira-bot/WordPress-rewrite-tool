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
// 最新情報調査（★最重要★）- 日本語 + 英語の並列検索
// ---------------------------------------------------------------------------

export async function checkFreshness(article, siteId, onProgress) {
  logger.info(`最新情報調査開始: "${article.title}"`);
  onProgress?.({ message: '最新情報を調査中...' });

  const claims = extractFactualClaims(article.content);
  logger.info(`抽出した情報要素: ${claims.length}件`);

  const model = genAI.getGenerativeModel({
    model: config.gemini.textModel,
    tools: [{ googleSearch: {} }],
  });

  let template;
  try {
    template = loadPrompt('freshness-check', siteId);
  } catch {
    template = getDefaultFreshnessPrompt();
  }

  const prompt = renderPrompt(template, {
    title: article.title,
    url: article.url,
    claims: claims.join('\n- '),
    content: article.content?.substring(0, 8000) || '',
  });

  onProgress?.({ message: 'Gemini + Google Search で情報を検証中（日本語＆英語並列）...' });

  // 日本語 + 英語の並列検索
  const [jaResult, enResult] = await Promise.allSettled([
    generateWithRetry(model, prompt, { timeoutMs: 180_000, label: '最新情報調査(JA)' }),
    generateWithRetry(model, getEnglishFreshnessPrompt(article, claims), { timeoutMs: 180_000, label: '最新情報調査(EN)' }),
  ]);

  const jaParsed = jaResult.status === 'fulfilled' ? parseJSON(jaResult.value.response.text()) : {};
  const enParsed = enResult.status === 'fulfilled' ? parseJSON(enResult.value.response.text()) : {};

  // 両方の結果をマージ
  const mergedFactChecks = mergeFactChecks(
    jaParsed.factChecks || [],
    enParsed.factChecks || []
  );
  const mergedNewInfo = mergeNewInfo(
    jaParsed.newInfo || [],
    enParsed.newInfo || []
  );

  const report = {
    checkedAt: new Date().toISOString(),
    totalClaims: claims.length,
    factChecks: mergedFactChecks,
    outdatedCount: mergedFactChecks.filter((f) => f.changed).length,
    newInfo: mergedNewInfo,
    summary: jaParsed.summary || enParsed.summary || '',
    recommendations: [
      ...(jaParsed.recommendations || []),
      ...(enParsed.recommendations || []).filter(
        (r) => !(jaParsed.recommendations || []).some((jr) => jr.includes(r.substring(0, 10)))
      ),
    ],
    searchLanguages: {
      ja: jaResult.status === 'fulfilled',
      en: enResult.status === 'fulfilled',
    },
  };

  logger.info(`最新情報調査完了: ${report.outdatedCount}件の古い情報を検出 (JA:${report.searchLanguages.ja}, EN:${report.searchLanguages.en})`);
  onProgress?.({
    message: `調査完了: ${report.outdatedCount}件の更新が必要な情報を検出`,
  });

  return report;
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
