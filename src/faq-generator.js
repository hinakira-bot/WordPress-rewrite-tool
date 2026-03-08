import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './config.js';
import logger from './logger.js';
import { loadPrompt, renderPrompt } from './prompt-manager.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} タイムアウト (${ms / 1000}秒)`)), ms)
    ),
  ]);
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { /* */ } }
    return { raw: cleaned };
  }
}

// ---------------------------------------------------------------------------
// FAQ生成
// ---------------------------------------------------------------------------

export async function generateFAQ(article, siteId, onProgress) {
  logger.info(`FAQ生成: "${article.title}"`);
  onProgress?.({ message: 'FAQを生成中...' });

  const model = genAI.getGenerativeModel({
    model: config.gemini.textModel,
    tools: [{ googleSearch: {} }],
  });

  let template;
  try {
    template = loadPrompt('faq-generate', siteId);
  } catch {
    template = getDefaultFaqPrompt();
  }

  const prompt = renderPrompt(template, {
    title: article.title,
    content: article.content?.substring(0, 6000) || '',
  });

  const result = await withTimeout(
    model.generateContent(prompt),
    120_000,
    'FAQ生成'
  );

  const text = result.response.text();
  const parsed = parseJSON(text);

  const faqs = parsed.faqs || parsed.faq || [];
  logger.info(`FAQ生成完了: ${faqs.length}件`);
  onProgress?.({ message: `FAQ ${faqs.length}件を生成しました` });

  return faqs;
}

// ---------------------------------------------------------------------------
// FAQ → SWELL FAQブロック HTML変換
// ---------------------------------------------------------------------------

export function faqToSwellBlock(faqs) {
  if (!faqs || faqs.length === 0) return '';

  return `
<!-- wp:heading -->
<h2 class="wp-block-heading">よくある質問（FAQ）</h2>
<!-- /wp:heading -->

<!-- wp:swell-blocks/faq {"className":"swell-block-faq"} -->
<div class="swell-block-faq" itemscope itemtype="https://schema.org/FAQPage">
${faqs.map((faq) => {
  const q = faq.question || faq.q || '';
  const a = faq.answer || faq.a || '';
  return `<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
<div class="swell-block-faq-item">
<div class="swell-block-faq-item__q" itemprop="name">${escapeHtml(q)}</div>
<div class="swell-block-faq-item__a" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
<div itemprop="text">${escapeHtml(a)}</div>
</div>
</div>
</div>`;
}).join('\n')}
</div>
<!-- /wp:swell-blocks/faq -->`;
}

// ---------------------------------------------------------------------------
// FAQ → 汎用HTML変換（SWELL以外）
// ---------------------------------------------------------------------------

export function faqToGenericHtml(faqs) {
  if (!faqs || faqs.length === 0) return '';

  const items = faqs.map((faq) => {
    const q = faq.question || faq.q || '';
    const a = faq.answer || faq.a || '';
    return `<div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
<h3 itemprop="name">${escapeHtml(q)}</h3>
<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
<p itemprop="text">${escapeHtml(a)}</p>
</div>
</div>`;
  }).join('\n');

  return `
<!-- wp:heading -->
<h2 class="wp-block-heading">よくある質問（FAQ）</h2>
<!-- /wp:heading -->

<div class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
${items}
</div>`;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDefaultFaqPrompt() {
  return `以下のブログ記事のテーマに基づいて、読者が疑問に思いそうなFAQ（よくある質問）を生成してください。

## 記事タイトル
{{title}}

## 記事本文（冒頭部分）
{{content}}

## 生成ルール
- 5〜8問のQ&Aを生成
- 記事の内容を補完する質問を含める
- SEO（AIO）に効果的なキーワードを自然に含める
- 回答は簡潔（2-3文）にする
- 最新のGoogle検索データを参照して、実際にユーザーが検索しそうな質問にする

## 出力形式（JSON）
{
  "faqs": [
    { "question": "質問文", "answer": "回答文" }
  ]
}`;
}
