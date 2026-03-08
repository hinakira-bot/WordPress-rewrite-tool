import * as cheerio from 'cheerio';
import logger from './logger.js';

// ---------------------------------------------------------------------------
// SWELL ブロックタイプ定義
// ---------------------------------------------------------------------------

const SWELL_TYPES = {
  point: { block: 'wp:loos/cap-block', style: 'is-style-onborder_ttl2', title: 'ポイント' },
  note: { block: 'wp:loos/cap-block', style: 'is-style-caution_ttl', title: '注意' },
  'check-list': { block: 'wp:loos/cap-block', style: 'is-style-check_list', title: 'チェック' },
  step: { block: 'wp:loos/step' },
  faq: { block: 'swell-block-faq' },
  balloon: { block: 'wp:loos/balloon' },
  border: { block: 'wp:group', style: 'has-border', border: '-border01' },
  'border-double': { block: 'wp:group', style: 'has-border', border: '-border02' },
  'border-dashed': { block: 'wp:group', style: 'has-border', border: '-border03' },
  'bg-color': { block: 'wp:group', style: 'has-border', border: '-border04' },
  stripe: { block: 'wp:group', style: 'is-style-bg_stripe' },
  grid: { block: 'wp:group', style: 'is-style-bg_grid' },
  stitch: { block: 'wp:group', style: 'is-style-stitch' },
};

// ---------------------------------------------------------------------------
// メインエントリポイント: リライト後のHTML後処理
// ---------------------------------------------------------------------------

export function postProcessContent(html, settings = {}) {
  if (!html) return html;

  let processed = html;

  // 1. SWELL装飾変換
  if (settings.swell?.enabled !== false) {
    processed = applySWELLDecorations(processed, settings);
  }

  // 2. Gutenbergブロック化
  processed = convertToGutenbergBlocks(processed, settings);

  // 3. 1文1段落ルール
  processed = splitSentencesToParagraphs(processed);

  // 4. 裸URLをリンク化
  processed = convertPlainUrlsToLinks(processed);

  return processed;
}

// ---------------------------------------------------------------------------
// SWELL装飾変換
// ---------------------------------------------------------------------------

export function applySWELLDecorations(html, settings = {}) {
  const $ = cheerio.load(html, { decodeEntities: false, xmlMode: false });

  $('[data-swell]').each((_, el) => {
    const $el = $(el);
    const type = $el.attr('data-swell');
    const config = SWELL_TYPES[type];
    if (!config) return;

    const innerHtml = $el.html() || '';
    let replacement = '';

    switch (type) {
      case 'point':
      case 'note':
      case 'check-list': {
        const title = $el.attr('data-title') || config.title || '';
        replacement = buildCapBlock(innerHtml, config.style, title);
        break;
      }
      case 'step':
        replacement = buildStepBlock(innerHtml, $);
        break;
      case 'faq':
        replacement = buildFaqBlock(innerHtml, $el, $);
        break;
      case 'balloon':
        replacement = buildBalloonBlock(innerHtml, settings);
        break;
      case 'border':
      case 'border-double':
      case 'border-dashed':
      case 'bg-color':
      case 'stripe':
      case 'grid':
      case 'stitch':
        replacement = buildGroupBlock(innerHtml, config);
        break;
      default:
        replacement = innerHtml;
    }

    $el.replaceWith(replacement);
  });

  return $('body').html() || html;
}

// ---------------------------------------------------------------------------
// キャプションボックス
// ---------------------------------------------------------------------------

function buildCapBlock(innerHtml, style, title) {
  const innerBlocks = wrapInnerContent(innerHtml);
  return `<!-- wp:loos/cap-block {"className":"${style}"} -->
<div class="swell-block-capbox cap_box ${style}">
<div class="cap_box_ttl"><span>${escapeHtml(title)}</span></div>
<div class="cap_box_content">
${innerBlocks}
</div>
</div>
<!-- /wp:loos/cap-block -->`;
}

// ---------------------------------------------------------------------------
// ステップブロック
// ---------------------------------------------------------------------------

function buildStepBlock(innerHtml, $) {
  const $temp = cheerio.load(innerHtml, { decodeEntities: false });
  const steps = [];

  // div.step-item もしくは直下の子要素をステップとして扱う
  const $items = $temp('.step-item, [data-step]');
  if ($items.length > 0) {
    $items.each((_, item) => {
      const $item = $temp(item);
      const title = $item.attr('data-title') || $item.find('.step-title, h3, h4').first().text() || '';
      const body = $item.find('.step-body, .step-content').html() || $item.html() || '';
      steps.push({ title, body });
    });
  } else {
    // フォールバック: 子要素を順番にステップとして扱う
    $temp('body').children().each((i, child) => {
      const $child = $temp(child);
      steps.push({ title: `ステップ ${i + 1}`, body: $child.html() || $child.text() });
    });
  }

  if (steps.length === 0) return innerHtml;

  const stepItems = steps.map(({ title, body }) => {
    const innerBlocks = wrapInnerContent(body);
    return `<!-- wp:loos/step-item {"stepLabel":"STEP","numColor":"var(--color_deep02)"} -->
<div class="swell-block-step__item">
<div class="swell-block-step__number" style="background-color:var(--color_deep02)">
<span class="__label">STEP</span>
</div>
<div class="swell-block-step__title u-fz-l">${escapeHtml(title)}</div>
<div class="swell-block-step__body">
${innerBlocks}
</div>
</div>
<!-- /wp:loos/step-item -->`;
  }).join('\n');

  return `<!-- wp:loos/step -->
<div class="swell-block-step" data-num-style="circle">
${stepItems}
</div>
<!-- /wp:loos/step -->`;
}

// ---------------------------------------------------------------------------
// FAQブロック
// ---------------------------------------------------------------------------

function buildFaqBlock(innerHtml, $el, $) {
  const $temp = cheerio.load(innerHtml, { decodeEntities: false });
  const faqItems = [];

  // Q/A ペアを検出
  const $qaDivs = $temp('.faq-item, [data-faq-item]');
  if ($qaDivs.length > 0) {
    $qaDivs.each((_, item) => {
      const $item = $temp(item);
      const q = $item.find('.faq-q, .question, dt').first().text().trim();
      const a = $item.find('.faq-a, .answer, dd').first().text().trim();
      if (q) faqItems.push({ q, a: a || '' });
    });
  } else {
    // 子要素をQ,A,Q,A...のペアとして解釈
    const children = $temp('body').children().toArray();
    for (let i = 0; i < children.length; i += 2) {
      const q = $temp(children[i]).text().trim();
      const a = children[i + 1] ? $temp(children[i + 1]).text().trim() : '';
      if (q) faqItems.push({ q, a });
    }
  }

  if (faqItems.length === 0) return innerHtml;

  const items = faqItems.map(({ q, a }) =>
    `<div class="swell-block-faq__item">
<div class="swell-block-faq__q">${escapeHtml(q)}</div>
<div class="swell-block-faq__a">${escapeHtml(a)}</div>
</div>`
  ).join('\n');

  return `<div class="swell-block-faq">
${items}
</div>`;
}

// ---------------------------------------------------------------------------
// 吹き出しブロック
// ---------------------------------------------------------------------------

function buildBalloonBlock(innerHtml, settings) {
  const balloonId = settings.swell?.balloonId || '1';
  const text = innerHtml.replace(/<[^>]+>/g, '').trim();

  return `<!-- wp:loos/balloon {"balloonID":"${balloonId}"} -->
<p>${escapeHtml(text)}</p>
<!-- /wp:loos/balloon -->`;
}

// ---------------------------------------------------------------------------
// グループブロック（ボーダー・背景系）
// ---------------------------------------------------------------------------

function buildGroupBlock(innerHtml, config) {
  const innerBlocks = wrapInnerContent(innerHtml);
  const classes = [config.style || '', config.border || ''].filter(Boolean).join(' ');

  return `<!-- wp:group {"className":"${classes}"} -->
<div class="wp-block-group ${classes}">
${innerBlocks}
</div>
<!-- /wp:group -->`;
}

// ---------------------------------------------------------------------------
// Gutenbergブロック変換
// ---------------------------------------------------------------------------

export function convertToGutenbergBlocks(html, settings = {}) {
  const elements = splitTopLevelElements(html);
  const blocks = [];

  for (const el of elements) {
    const trimmed = el.trim();
    if (!trimmed) continue;

    // 既にGutenbergコメントがある場合はスキップ
    if (trimmed.startsWith('<!-- wp:')) {
      blocks.push(trimmed);
      continue;
    }

    const block = convertElementToBlock(trimmed);
    blocks.push(block);
  }

  return blocks.join('\n\n');
}

function convertElementToBlock(html) {
  const tagMatch = html.match(/^<(\w+)/);
  if (!tagMatch) return html;

  const tag = tagMatch[1].toLowerCase();

  switch (tag) {
    case 'p':
      return `<!-- wp:paragraph -->\n${html}\n<!-- /wp:paragraph -->`;

    case 'h2':
      return `<!-- wp:heading -->\n${addClassToTag(html, 'h2', 'wp-block-heading')}\n<!-- /wp:heading -->`;

    case 'h3':
      return `<!-- wp:heading {"level":3} -->\n${addClassToTag(html, 'h3', 'wp-block-heading')}\n<!-- /wp:heading -->`;

    case 'h4':
      return `<!-- wp:heading {"level":4} -->\n${addClassToTag(html, 'h4', 'wp-block-heading')}\n<!-- /wp:heading -->`;

    case 'ul':
      return convertListBlock(html, false);

    case 'ol':
      return convertListBlock(html, true);

    case 'table':
      return `<!-- wp:table -->\n<figure class="wp-block-table">${html}</figure>\n<!-- /wp:table -->`;

    case 'blockquote':
      return `<!-- wp:quote -->\n${html}\n<!-- /wp:quote -->`;

    case 'figure':
      if (html.includes('wp-block-image') || html.includes('<img')) {
        return `<!-- wp:image -->\n${html}\n<!-- /wp:image -->`;
      }
      return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;

    case 'div':
      // SWELLブロック等
      if (html.includes('swell-block-') || html.includes('cap_box')) {
        return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
      }
      return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;

    default:
      return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
  }
}

// ---------------------------------------------------------------------------
// リストブロック変換
// ---------------------------------------------------------------------------

function convertListBlock(html, ordered) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const tag = ordered ? 'ol' : 'ul';
  const $list = $(tag).first();

  $list.addClass('wp-block-list');

  const listItems = [];
  $list.children('li').each((_, li) => {
    const $li = $(li);
    listItems.push(`<!-- wp:list-item -->\n<li>${$li.html()}</li>\n<!-- /wp:list-item -->`);
  });

  const attrs = ordered ? ' {"ordered":true}' : '';
  const listHtml = `<${tag} class="wp-block-list">${listItems.join('\n')}</${tag}>`;

  return `<!-- wp:list${attrs} -->\n${listHtml}\n<!-- /wp:list -->`;
}

// ---------------------------------------------------------------------------
// 1文1段落ルール
// ---------------------------------------------------------------------------

export function splitSentencesToParagraphs(html) {
  return html.replace(
    /<!-- wp:paragraph -->\s*<p>([\s\S]*?)<\/p>\s*<!-- \/wp:paragraph -->/g,
    (match, content) => {
      // 既に1文の場合はそのまま
      const sentences = content.split(/(?<=[。！？])\s*/).filter(Boolean);
      if (sentences.length <= 1) return match;

      return sentences
        .map((s) => `<!-- wp:paragraph -->\n<p>${s.trim()}</p>\n<!-- /wp:paragraph -->`)
        .join('\n\n');
    }
  );
}

// ---------------------------------------------------------------------------
// 裸URL → リンク変換
// ---------------------------------------------------------------------------

export function convertPlainUrlsToLinks(html) {
  return html.replace(
    /(?<!href=["'])(https?:\/\/[^\s<>"]+)/g,
    (match) => {
      // 既にアンカータグ内の場合はスキップ
      return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    }
  );
}

// ---------------------------------------------------------------------------
// リンク検証 post-processing
// ---------------------------------------------------------------------------

export async function validateLinks(html, siteUrl, articleIndex = []) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const removedLinks = [];

  // 内部リンクホワイトリスト検証
  const knownUrls = new Set(articleIndex.map((a) => a.url?.toLowerCase()));
  const siteUrlNormalized = siteUrl?.replace(/\/+$/, '').toLowerCase() || '';

  $('a[href]').each((_, el) => {
    const $a = $(el);
    const href = ($a.attr('href') || '').trim();
    if (!href || href.startsWith('#')) return;

    try {
      const url = new URL(href, siteUrl);
      const fullUrl = url.href.toLowerCase();

      // 内部リンク: ホワイトリストにない場合はテキストに置換
      if (siteUrlNormalized && fullUrl.startsWith(siteUrlNormalized)) {
        if (knownUrls.size > 0 && !knownUrls.has(fullUrl)) {
          const text = $a.text();
          $a.replaceWith(text);
          removedLinks.push({ url: href, reason: 'not in article index' });
        }
      }
    } catch {
      // URL解析エラーはスキップ
    }
  });

  if (removedLinks.length > 0) {
    logger.info(`リンク検証: ${removedLinks.length}件の不正リンクを除去`);
  }

  return {
    html: $('body').html() || html,
    removedLinks,
  };
}

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function splitTopLevelElements(html) {
  const elements = [];
  let current = '';
  let depth = 0;
  let i = 0;

  while (i < html.length) {
    // HTMLコメント
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i);
      if (end !== -1) {
        const comment = html.substring(i, end + 3);
        current += comment;
        i = end + 3;
        continue;
      }
    }

    // 開始タグ
    if (html[i] === '<' && html[i + 1] !== '/') {
      const tagEnd = html.indexOf('>', i);
      if (tagEnd !== -1) {
        const tagContent = html.substring(i, tagEnd + 1);
        const selfClosing = tagContent.endsWith('/>') ||
          /^<(?:br|hr|img|input|meta|link)\b/i.test(tagContent);

        current += tagContent;
        if (!selfClosing && !tagContent.startsWith('<!')) {
          depth++;
        }
        i = tagEnd + 1;
        continue;
      }
    }

    // 終了タグ
    if (html[i] === '<' && html[i + 1] === '/') {
      const tagEnd = html.indexOf('>', i);
      if (tagEnd !== -1) {
        current += html.substring(i, tagEnd + 1);
        depth--;
        i = tagEnd + 1;

        if (depth <= 0) {
          elements.push(current.trim());
          current = '';
          depth = 0;
        }
        continue;
      }
    }

    // テキストノード
    current += html[i];
    i++;

    // トップレベルの改行区切り
    if (depth === 0 && html[i] === '\n' && current.trim()) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('<')) {
        // テキストのみの行は段落として扱う
        elements.push(`<p>${trimmed}</p>`);
        current = '';
      }
    }
  }

  if (current.trim()) {
    elements.push(current.trim());
  }

  return elements;
}

function wrapInnerContent(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const blocks = [];

  $('body').children().each((_, el) => {
    const $el = $(el);
    const outerHtml = $.html(el);
    blocks.push(convertElementToBlock(outerHtml));
  });

  return blocks.join('\n') || html;
}

function addClassToTag(html, tag, className) {
  const regex = new RegExp(`<${tag}(\\s|>)`);
  if (html.includes(`class="`)) {
    return html.replace(/class="([^"]*)"/, (_, existing) =>
      `class="${existing} ${className}"`
    );
  }
  return html.replace(regex, `<${tag} class="${className}"$1`);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
