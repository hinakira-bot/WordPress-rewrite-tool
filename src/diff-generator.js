import { diffWords } from 'diff';
import * as cheerio from 'cheerio';
import logger from './logger.js';

// ---------------------------------------------------------------------------
// テキスト差分生成
// ---------------------------------------------------------------------------

export function generateDiff(originalHtml, rewrittenHtml) {
  logger.info('差分生成中...');

  // HTMLからテキスト抽出
  const originalText = htmlToText(originalHtml);
  const rewrittenText = htmlToText(rewrittenHtml);

  // 単語レベルの差分
  const wordDiffs = diffWords(originalText, rewrittenText);

  // 変更統計
  let addedWords = 0;
  let removedWords = 0;
  let unchangedWords = 0;

  for (const part of wordDiffs) {
    const count = part.value.split(/\s+/).filter(Boolean).length;
    if (part.added) addedWords += count;
    else if (part.removed) removedWords += count;
    else unchangedWords += count;
  }

  // 変更サマリー
  const summary = generateChangeSummary(originalHtml, rewrittenHtml);

  return {
    diffs: wordDiffs,
    stats: {
      addedWords,
      removedWords,
      unchangedWords,
      changePercentage: Math.round(
        ((addedWords + removedWords) / Math.max(1, addedWords + removedWords + unchangedWords)) * 100
      ),
    },
    summary,
    original: {
      text: originalText,
      length: originalText.length,
    },
    rewritten: {
      text: rewrittenText,
      length: rewrittenText.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 変更サマリー
// ---------------------------------------------------------------------------

function generateChangeSummary(originalHtml, rewrittenHtml) {
  const summary = [];

  // タイトル変更（H1）
  const origH1 = extractFirstHeading(originalHtml, 'h1');
  const newH1 = extractFirstHeading(rewrittenHtml, 'h1');
  if (origH1 && newH1 && origH1 !== newH1) {
    summary.push(`タイトル変更: "${origH1}" → "${newH1}"`);
  }

  // H2見出し数の変化
  const origH2 = countElements(originalHtml, 'h2');
  const newH2 = countElements(rewrittenHtml, 'h2');
  if (origH2 !== newH2) {
    summary.push(`H2見出し: ${origH2}個 → ${newH2}個`);
  }

  // FAQ追加チェック
  if (!originalHtml.includes('FAQ') && rewrittenHtml.includes('FAQ')) {
    summary.push('FAQセクションを追加');
  }
  if (!originalHtml.includes('よくある質問') && rewrittenHtml.includes('よくある質問')) {
    summary.push('「よくある質問」セクションを追加');
  }

  // リンク数の変化
  const origLinks = countElements(originalHtml, 'a');
  const newLinks = countElements(rewrittenHtml, 'a');
  if (origLinks !== newLinks) {
    const diff = newLinks - origLinks;
    summary.push(`リンク数: ${origLinks}個 → ${newLinks}個 (${diff > 0 ? '+' : ''}${diff})`);
  }

  // 文字数変化
  const origLen = htmlToText(originalHtml).length;
  const newLen = htmlToText(rewrittenHtml).length;
  const lenDiff = newLen - origLen;
  if (Math.abs(lenDiff) > 100) {
    summary.push(`文字数: ${origLen.toLocaleString()} → ${newLen.toLocaleString()} (${lenDiff > 0 ? '+' : ''}${lenDiff.toLocaleString()})`);
  }

  // UPDATED コメントを抽出
  const updateComments = rewrittenHtml.match(/<!-- UPDATED: (.*?) -->/g);
  if (updateComments) {
    for (const comment of updateComments) {
      const reason = comment.replace(/<!-- UPDATED: /, '').replace(/ -->/, '');
      summary.push(`更新: ${reason}`);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function htmlToText(html) {
  const $ = cheerio.load(html || '', { decodeEntities: false });
  $('script, style').remove();
  return $.text().replace(/\s+/g, ' ').trim();
}

function extractFirstHeading(html, tag) {
  const $ = cheerio.load(html || '', { decodeEntities: false });
  return $(tag).first().text().trim() || null;
}

function countElements(html, tag) {
  const $ = cheerio.load(html || '', { decodeEntities: false });
  return $(tag).length;
}
