import * as cheerio from 'cheerio';
import logger from './logger.js';

// ---------------------------------------------------------------------------
// SWELL ブロックタイプ定義
// ---------------------------------------------------------------------------

const SWELL_CLASS_MAP = {
  point: 'is-style-onborder_ttl2',
  note: 'is-style-caution_ttl',
  'check-list': 'is-style-check_list',
  border: 'has-border -border01',
  'border-double': 'has-border -border02',
  'border-dashed': 'has-border -border03',
  'bg-color': 'has-border -border04',
  stripe: 'is-style-bg_stripe',
  grid: 'is-style-bg_grid',
  stitch: 'is-style-stitch',
};

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'embed', 'area', 'base', 'col', 'param', 'track', 'wbr']);

// ---------------------------------------------------------------------------
// メインエントリポイント
// ---------------------------------------------------------------------------

export function postProcessContent(html, settings = {}) {
  if (!html) return html;
  let processed = html;

  // AIが既にGutenbergブロックを出力しているか判定
  const gutenbergCommentCount = (html.match(/<!-- wp:/g) || []).length;
  const hasGutenbergBlocks = gutenbergCommentCount >= 3;

  if (hasGutenbergBlocks) {
    // ★ AI出力が既にGutenbergブロック形式の場合: 軽量修正のみ ★
    // ★ cheerio は絶対に使わない（Gutenbergコメント破壊の原因）★
    logger.info(`Gutenbergブロック検出 (${gutenbergCommentCount}件) - 軽量修正モード`);

    // 0. ★最重要★ <p>で囲まれたブロックコメントを解放（クラシック表示の最大原因）
    processed = unwrapBlockCommentsFromPTags(processed);

    // 0.5. リンクスタイル設定: テキストリンクモードならボタン・ブログカードを変換
    if (settings.content?.linkStyle === 'text' || (!settings.content?.linkStyle)) {
      processed = convertButtonsToTextLinks(processed);
      processed = convertBlogCardsToTextLinks(processed);
    }

    // 1. <!-- UPDATED: ... --> コメントと不正ブロックを除去
    processed = removeUpdatedComments(processed);

    // 2. <p>タグ欠落の修復
    processed = repairMissingPTags(processed);

    // 3. 壊れたURLを修復（HTML entities が混入したhref）
    processed = cleanBrokenUrls(processed);

    // 4. 見出しにwp-block-headingクラスを確保
    processed = ensureAllHeadingClasses(processed);

    // 5. 見出しの <!-- /wp:heading --> 閉じコメント欠落を修復
    processed = repairMissingHeadingClose(processed);

    // 6. ★新★ 段落の <!-- /wp:paragraph --> 閉じコメント欠落を修復
    processed = repairMissingParagraphClose(processed);

    // 7. 最終チェック: まだ<p>囲みが残っていないか再度除去
    processed = unwrapBlockCommentsFromPTags(processed);

    // 8. ★新★ 孤立した閉じコメントを除去（開始コメントなしの<!-- /wp:xxx -->）
    processed = removeOrphanBlockComments(processed);

    // 9. ★ SWELL FAQブロック構造修復（閉じタグ欠落の修復）★
    processed = repairFaqBlockStructure(processed);

    // 10. ★ Gutenberg整合性チェック＆自動修復 ★
    processed = validateAndRepairGutenberg(processed);

    return processed;
  }

  // ★ 生HTMLの場合: フルパイプライン ★
  logger.info('Gutenbergブロック未検出 - フル変換パイプライン');

  // 1. SWELL装飾変換
  if (settings.swell?.enabled !== false) {
    processed = applySWELLDecorations(processed, settings);
  }

  // 2. Gutenbergブロック化
  processed = convertToGutenbergBlocks(processed, settings);

  return processed;
}

// ---------------------------------------------------------------------------
// SWELL装飾変換 (data-swell → SWELL ブロック)
// ---------------------------------------------------------------------------

export function applySWELLDecorations(html, settings = {}) {
  const $ = cheerio.load(html, { decodeEntities: false, xmlMode: false });
  const balloonID = settings.swell?.balloonID || '1';

  $('[data-swell]').each((_, el) => {
    const $el = $(el);
    const type = $el.attr('data-swell');
    let replacement = '';

    switch (type) {
      case 'point':
      case 'note':
        replacement = convertCaptionBox($, $el, type);
        break;
      case 'check-list':
        replacement = convertCheckList($, $el);
        break;
      case 'step':
        replacement = convertStepBlock($, $el);
        break;
      case 'faq':
        replacement = convertFaqBlock($, $el);
        break;
      case 'balloon':
        replacement = convertBalloonBlock($, $el, balloonID);
        break;
      case 'border':
      case 'border-double':
      case 'border-dashed':
      case 'bg-color':
      case 'stripe':
      case 'grid':
      case 'stitch':
        replacement = convertGroupBox($, $el, SWELL_CLASS_MAP[type]);
        break;
      default:
        replacement = $el.html() || '';
    }

    $el.replaceWith(replacement);
  });

  return $('body').html() || html;
}

// ---------------------------------------------------------------------------
// キャプションボックス (point / note)
// ---------------------------------------------------------------------------

function convertCaptionBox($, $el, type) {
  const style = SWELL_CLASS_MAP[type];
  const title = extractTitle($, $el);
  const innerBlocks = convertInnerToGutenberg($, $el);

  return `<!-- wp:loos/cap-block {"className":"${style}"} -->
<div class="swell-block-capbox cap_box ${style}">
<div class="cap_box_ttl"><span>${title}</span></div>
<div class="cap_box_content">
${innerBlocks}
</div></div>
<!-- /wp:loos/cap-block -->`;
}

// ---------------------------------------------------------------------------
// チェックリスト
// ---------------------------------------------------------------------------

function convertCheckList($, $el) {
  const style = 'is-style-check_list';
  const $list = $el.find('ul, ol').first();
  let listHtml = '';

  if ($list.length > 0) {
    listHtml = wrapListForGutenberg($, $list, style);
  } else {
    // リストがない場合はコンテンツをそのまま使う
    listHtml = convertInnerToGutenberg($, $el);
  }

  return `<!-- wp:loos/cap-block {"className":"${style}"} -->
<div class="swell-block-capbox cap_box ${style}">
<div class="cap_box_content">
${listHtml}
</div></div>
<!-- /wp:loos/cap-block -->`;
}

// ---------------------------------------------------------------------------
// ステップブロック
// ---------------------------------------------------------------------------

function convertStepBlock($, $el) {
  const children = $el.children('div, section, article').toArray();
  const steps = [];

  if (children.length > 0) {
    for (const child of children) {
      const $child = $(child);
      const title = extractTitle($, $child);
      const body = convertInnerToGutenberg($, $child);
      steps.push({ title, body });
    }
  } else {
    // フォールバック: 子要素を順番に
    $el.children().each((i, child) => {
      const $child = $(child);
      steps.push({ title: `ステップ ${i + 1}`, body: convertInnerToGutenberg($, $child) });
    });
  }

  if (steps.length === 0) return $el.html() || '';

  const stepItems = steps.map(({ title, body }) => `<!-- wp:loos/step-item {"stepLabel":"STEP","numColor":"var(--color_deep02)"} -->
<div class="swell-block-step__item">
<div class="swell-block-step__number" style="background-color:var(--color_deep02)"><span class="__label">STEP</span></div>
<div class="swell-block-step__title u-fz-l">${title}</div>
<div class="swell-block-step__body">
${body}
</div>
</div>
<!-- /wp:loos/step-item -->`).join('\n');

  return `<!-- wp:loos/step -->
<div class="swell-block-step" data-num-style="circle">
${stepItems}
</div>
<!-- /wp:loos/step -->`;
}

// ---------------------------------------------------------------------------
// FAQブロック (data-swell="faq" からの変換)
// ---------------------------------------------------------------------------

function convertFaqBlock($, $el) {
  const faqItems = [];
  const children = $el.children().toArray();

  // Strategy 1: 明示的なQ/Aクラス
  const $qaDivs = $el.find('.faq-item, [data-faq-item], dl');
  if ($qaDivs.length > 0) {
    $qaDivs.each((_, item) => {
      const $item = $(item);
      const q = $item.find('.faq-q, .question, dt').first().text().trim();
      const a = $item.find('.faq-a, .answer, dd').first().text().trim();
      if (q) faqItems.push({ q, a: a || '' });
    });
  }

  // Strategy 2: 子要素を Q, A, Q, A... ペアとして
  if (faqItems.length === 0 && children.length >= 2) {
    for (let i = 0; i < children.length; i += 2) {
      const q = $(children[i]).text().trim();
      const a = children[i + 1] ? $(children[i + 1]).text().trim() : '';
      if (q) faqItems.push({ q, a });
    }
  }

  // Strategy 3: フォールバック
  if (faqItems.length === 0) {
    const text = $el.text().trim();
    if (text) faqItems.push({ q: text, a: '' });
  }

  // Auto-Posting互換のBEMクラス名 + wp:html ラッパー
  const items = faqItems.map(({ q, a }) =>
    `  <div class="swell-block-faq__item">
    <div class="swell-block-faq__q">${q}</div>
    <div class="swell-block-faq__a"><p>${a}</p></div>
  </div>`).join('\n');

  return `<!-- wp:html -->
<div class="swell-block-faq">
${items}
</div>
<!-- /wp:html -->`;
}

// ---------------------------------------------------------------------------
// 吹き出しブロック
// ---------------------------------------------------------------------------

function convertBalloonBlock($, $el, balloonID) {
  let content = $el.html() || '';
  const hasBlockTag = /<(?:p|div|ul|ol|blockquote|h[1-6])\b/i.test(content);

  if (!hasBlockTag) {
    content = `<p>${content.replace(/<[^>]+>/g, '').trim()}</p>`;
  }

  return `<!-- wp:loos/balloon {"balloonID":"${balloonID}"} -->
${content}
<!-- /wp:loos/balloon -->`;
}

// ---------------------------------------------------------------------------
// グループブロック（ボーダー・背景系）
// ---------------------------------------------------------------------------

function convertGroupBox($, $el, cssClasses) {
  const innerBlocks = convertInnerToGutenberg($, $el);

  return `<!-- wp:group {"className":"${cssClasses}","layout":{"type":"constrained"}} -->
<div class="wp-block-group ${cssClasses}">
${innerBlocks}
</div>
<!-- /wp:group -->`;
}

// ---------------------------------------------------------------------------
// ★ 内部コンテンツの再帰的Gutenberg変換（クラシック表示回避の核心）★
// ---------------------------------------------------------------------------

function convertInnerToGutenberg($, $el) {
  const blocks = [];

  $el.children().each((_, child) => {
    const $child = $(child);
    const outerHtml = $.html(child).trim();
    if (!outerHtml) return;

    // 既にGutenbergコメントがあればスキップ
    if (/<!--\s*\/?wp:/.test(outerHtml)) {
      blocks.push(outerHtml);
      return;
    }

    const tag = child.tagName?.toLowerCase();

    switch (tag) {
      case 'p':
        blocks.push(`<!-- wp:paragraph -->\n${outerHtml}\n<!-- /wp:paragraph -->`);
        break;
      case 'h2':
        blocks.push(`<!-- wp:heading -->\n${ensureHeadingClass(outerHtml)}\n<!-- /wp:heading -->`);
        break;
      case 'h3':
        blocks.push(`<!-- wp:heading {"level":3} -->\n${ensureHeadingClass(outerHtml)}\n<!-- /wp:heading -->`);
        break;
      case 'h4':
        blocks.push(`<!-- wp:heading {"level":4} -->\n${ensureHeadingClass(outerHtml)}\n<!-- /wp:heading -->`);
        break;
      case 'ul':
        blocks.push(wrapListForGutenberg($, $child));
        break;
      case 'ol':
        blocks.push(wrapListForGutenberg($, $child));
        break;
      case 'blockquote':
        blocks.push(`<!-- wp:quote -->\n${outerHtml}\n<!-- /wp:quote -->`);
        break;
      case 'table':
        blocks.push(`<!-- wp:table -->\n<figure class="wp-block-table">${outerHtml}</figure>\n<!-- /wp:table -->`);
        break;
      case 'figure':
        if (outerHtml.includes('wp-block-image') || $child.find('img').length > 0) {
          blocks.push(`<!-- wp:image -->\n${outerHtml}\n<!-- /wp:image -->`);
        } else {
          blocks.push(`<!-- wp:html -->\n${outerHtml}\n<!-- /wp:html -->`);
        }
        break;
      case 'img':
        blocks.push(`<!-- wp:image -->\n${outerHtml}\n<!-- /wp:image -->`);
        break;
      default:
        blocks.push(`<!-- wp:html -->\n${outerHtml}\n<!-- /wp:html -->`);
    }
  });

  return blocks.join('\n');
}

// ---------------------------------------------------------------------------
// Gutenbergブロック変換（トップレベル）
// ---------------------------------------------------------------------------

export function convertToGutenbergBlocks(html, settings = {}) {
  const elements = splitTopLevelElements(html);
  const blocks = [];

  for (const el of elements) {
    const trimmed = el.trim();
    if (!trimmed) continue;

    // 既にGutenbergコメントがある場合はスキップ
    if (/<!--\s*\/?wp:/.test(trimmed)) {
      blocks.push(trimmed);
      continue;
    }

    // SWELLブロック div は <!-- wp:html --> で囲む
    if (trimmed.includes('swell-block-') || trimmed.includes('cap_box')) {
      blocks.push(`<!-- wp:html -->\n${trimmed}\n<!-- /wp:html -->`);
      continue;
    }

    const tagMatch = trimmed.match(/^<(\w+)/);
    if (!tagMatch) {
      // テキストのみ → 段落化
      if (trimmed.length > 0) {
        blocks.push(`<!-- wp:paragraph -->\n<p>${trimmed}</p>\n<!-- /wp:paragraph -->`);
      }
      continue;
    }

    const tag = tagMatch[1].toLowerCase();

    switch (tag) {
      case 'p':
        blocks.push(`<!-- wp:paragraph -->\n${trimmed}\n<!-- /wp:paragraph -->`);
        break;
      case 'h2':
        blocks.push(`<!-- wp:heading -->\n${ensureHeadingClass(trimmed)}\n<!-- /wp:heading -->`);
        break;
      case 'h3':
        blocks.push(`<!-- wp:heading {"level":3} -->\n${ensureHeadingClass(trimmed)}\n<!-- /wp:heading -->`);
        break;
      case 'h4':
        blocks.push(`<!-- wp:heading {"level":4} -->\n${ensureHeadingClass(trimmed)}\n<!-- /wp:heading -->`);
        break;
      case 'h5':
        blocks.push(`<!-- wp:heading {"level":5} -->\n${ensureHeadingClass(trimmed)}\n<!-- /wp:heading -->`);
        break;
      case 'ul': {
        const $ = cheerio.load(trimmed, { decodeEntities: false });
        blocks.push(wrapListForGutenberg($, $('ul').first()));
        break;
      }
      case 'ol': {
        const $ = cheerio.load(trimmed, { decodeEntities: false });
        blocks.push(wrapListForGutenberg($, $('ol').first()));
        break;
      }
      case 'table':
        blocks.push(`<!-- wp:table -->\n<figure class="wp-block-table">${trimmed}</figure>\n<!-- /wp:table -->`);
        break;
      case 'blockquote':
        blocks.push(`<!-- wp:quote -->\n${trimmed}\n<!-- /wp:quote -->`);
        break;
      case 'figure':
        if (trimmed.includes('wp-block-image') || trimmed.includes('<img')) {
          blocks.push(`<!-- wp:image {"style":{"spacing":{"margin":{"top":"0","bottom":"0"}}}} -->\n${trimmed}\n<!-- /wp:image -->\n<!-- wp:spacer {"height":"30px"} -->\n<div style="height:30px" aria-hidden="true" class="wp-block-spacer"></div>\n<!-- /wp:spacer -->`);
        } else if (trimmed.includes('wp-block-table')) {
          blocks.push(`<!-- wp:table -->\n${trimmed}\n<!-- /wp:table -->`);
        } else {
          blocks.push(`<!-- wp:html -->\n${trimmed}\n<!-- /wp:html -->`);
        }
        break;
      case 'img':
        blocks.push(`<!-- wp:image -->\n${trimmed}\n<!-- /wp:image -->`);
        break;
      case 'div':
        blocks.push(`<!-- wp:html -->\n${trimmed}\n<!-- /wp:html -->`);
        break;
      default:
        blocks.push(`<!-- wp:html -->\n${trimmed}\n<!-- /wp:html -->`);
    }
  }

  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// リスト変換（wp:list + wp:list-item）
// ---------------------------------------------------------------------------

function wrapListForGutenberg($, $list, extraClass = '') {
  const isOrdered = $list.is('ol');
  const tag = isOrdered ? 'ol' : 'ul';

  const classes = ['wp-block-list', extraClass].filter(Boolean).join(' ');
  const items = [];

  $list.children('li').each((_, li) => {
    items.push(`<!-- wp:list-item -->\n<li>${$(li).html()}</li>\n<!-- /wp:list-item -->`);
  });

  const attrs = isOrdered ? ' {"ordered":true}' : '';
  return `<!-- wp:list${attrs} -->\n<${tag} class="${classes}">${items.join('\n')}</${tag}>\n<!-- /wp:list -->`;
}

// ---------------------------------------------------------------------------
// ★ SWELL FAQブロック構造の修復 ★
// AIが faq-item の閉じタグ (</dd></div><!-- /wp:loos/faq-item -->)を
// 忘れて次の faq-item を開始するケースを修復する
// ---------------------------------------------------------------------------

function repairFaqBlockStructure(html) {
  let count = 0;

  // パターン: <!-- /wp:paragraph --> の後に </dd></div><!-- /wp:loos/faq-item --> がなく
  // 直接 <!-- wp:loos/faq-item --> が来る場合、閉じタグを挿入
  let result = html.replace(
    /(<!-- \/wp:paragraph -->)\s*(?!<\/dd>)(<!-- wp:loos\/faq-item -->)/g,
    (match, closeParagraph, openFaqItem) => {
      count++;
      return `${closeParagraph}</dd></div>\n<!-- /wp:loos/faq-item -->${openFaqItem}`;
    }
  );

  // パターン2: <!-- /wp:paragraph --> の後に </dd></div> はあるが
  // <!-- /wp:loos/faq-item --> がなく次の <!-- wp:loos/faq-item --> が来る
  result = result.replace(
    /(<\/dd><\/div>)\s*(?!<!-- \/wp:loos\/faq-item -->)(<!-- wp:loos\/faq-item -->)/g,
    (match, closeTags, openFaqItem) => {
      count++;
      return `${closeTags}\n<!-- /wp:loos/faq-item -->${openFaqItem}`;
    }
  );

  // パターン3: 最後のFAQ項目の後に </dd></div><!-- /wp:loos/faq-item --> がない場合
  // <!-- /wp:paragraph --> の後に直接 </dl> が来る
  result = result.replace(
    /(<!-- \/wp:paragraph -->)\s*(?!<\/dd>)(<\/dl>)/g,
    (match, closeParagraph, closeDl) => {
      count++;
      return `${closeParagraph}</dd></div>\n<!-- /wp:loos/faq-item -->${closeDl}`;
    }
  );

  if (count > 0) {
    logger.info(`FAQ構造修復: ${count}件の欠落した閉じタグを挿入`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// ★ SWELLボタンブロック → テキストリンク変換 ★
// wp:loos/button ブロックを自然なテキストリンクの段落に変換
// ---------------------------------------------------------------------------

function convertButtonsToTextLinks(html) {
  let count = 0;

  // wp:loos/button ブロック全体をマッチして変換
  const result = html.replace(
    /<!-- wp:loos\/button\s+(\{[\s\S]*?\})\s*-->\s*<div[^>]*class="swell-block-button[^"]*"[^>]*>\s*<a\s+href="([^"]*)"[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<\/a>\s*<\/div>\s*<!-- \/wp:loos\/button -->/g,
    (match, jsonStr, href, text) => {
      count++;
      const linkText = text.trim() || 'リンク';
      return `<!-- wp:paragraph -->\n<p><a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a></p>\n<!-- /wp:paragraph -->`;
    }
  );

  if (count > 0) {
    logger.info(`ボタン→テキストリンク変換: ${count}件`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// ★ SWELLブログカード → テキストリンク変換 ★
// wp:loos/post-link 自己閉じブロックを文中テキストリンクに変換
// ---------------------------------------------------------------------------

function convertBlogCardsToTextLinks(html) {
  let count = 0;

  // wp:loos/post-link 自己閉じブロック: <!-- wp:loos/post-link {"postId":12345,...} /-->
  const result = html.replace(
    /<!-- wp:loos\/post-link\s+(\{[\s\S]*?\})\s*\/-->/g,
    (match, jsonStr) => {
      try {
        const attrs = JSON.parse(jsonStr);
        const postId = attrs.postId;
        if (!postId) return match; // postIdがなければそのまま

        count++;
        // postIdからURLを構築する代わりに、コメントで残す（URLはWP側でのみ解決可能）
        // 代替: 内部リンクとしてマークだけしておく
        return `<!-- テキストリンク化済（元postId:${postId}） -->`;
      } catch {
        return match;
      }
    }
  );

  if (count > 0) {
    logger.info(`ブログカード→テキストリンク変換: ${count}件`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// ★★★ 最重要: <p>で囲まれたブロックコメントを解放 ★★★
// AIが <p><!-- wp:heading --></p> のように出力すると、WordPressが
// ブロックコメントを認識できず全てクラシックブロックになる
// ---------------------------------------------------------------------------

function unwrapBlockCommentsFromPTags(html) {
  let result = html;
  let prevResult;
  let totalFixed = 0;

  // 繰り返し適用（ネストした場合に備えて）
  do {
    prevResult = result;

    // ★ メインパターン: <p><!-- wp:xxx ... --></p> → <!-- wp:xxx ... -->
    // <p>にclass属性があっても対応（<p class="..."><!-- wp:xxx --></p>）
    // JSON属性にネストした{}があっても対応（.*?で-->まで最短マッチ）
    result = result.replace(
      /<p[^>]*>\s*(<!--\s*\/?\s*wp:[\w\/-]+(?:\s[\s\S]*?)?-->)\s*<\/p>/g,
      (match, comment) => {
        totalFixed++;
        return comment;
      }
    );

  } while (result !== prevResult);

  // ★ 孤立した</p>がブロックコメント直後にある場合を除去
  // 例: <!-- wp:list --></p> → <!-- wp:list -->
  // ★ ただし正当な構造 <!-- wp:paragraph --><p>text</p> は除外
  result = result.replace(
    /(<!--\s*\/?\s*wp:[\w\/-]+(?:\s[\s\S]*?)?-->)<\/p>/g,
    (match, comment) => {
      totalFixed++;
      return comment;
    }
  );

  // ★ 孤立した<p>がブロックコメント直前にある場合を除去
  // 例: <p><!-- wp:heading --> → <!-- wp:heading -->
  // ★ ただし<p>の後に</p>が来る正常パターンは上で処理済み
  result = result.replace(
    /<p[^>]*>\s*(<!--\s*\/?\s*wp:[\w\/-]+(?:\s[\s\S]*?)?-->)(?!\s*<\/p>)/g,
    (match, comment) => {
      totalFixed++;
      return comment;
    }
  );

  // <p>で囲まれた不正ブロックも除去: <p><!-- /wp:post-content --></p> → 空文字
  result = result.replace(
    /<p[^>]*>\s*<!--\s*\/?wp:(?:post-content|template-part|site-title|site-tagline|query|post-template|post-excerpt)\s*(?:[\s\S]*?)?-->\s*<\/p>/g,
    ''
  );

  // <p>なしの不正ブロックも除去
  result = result.replace(
    /<!--\s*\/?wp:(?:post-content|template-part|site-title|site-tagline|query|post-template|post-excerpt)\s*(?:[\s\S]*?)?-->/g,
    ''
  );

  if (totalFixed > 0) {
    logger.info(`unwrap: <p>囲みブロックコメントを${totalFixed}件修復`);
  }

  return result;
}

// ★ WordPress送信前の最終サニタイズ（外部から呼べるようexport）★
export function sanitizeForWordPress(html) {
  if (!html) return html;
  let result = html;

  logger.info('sanitizeForWordPress: 最終サニタイズ開始');

  // 1. <p>囲みブロックコメントを解放
  result = unwrapBlockCommentsFromPTags(result);

  // 2. 段落閉じコメント欠落を修復
  result = repairMissingParagraphClose(result);

  // 3. 見出し閉じコメント欠落を修復
  result = repairMissingHeadingClose(result);

  // 4. 孤立閉じコメントを除去
  result = removeOrphanBlockComments(result);

  // 4.5. FAQ構造修復
  result = repairFaqBlockStructure(result);

  // 5. 空の<p></p>除去
  result = result.replace(/<p>\s*<\/p>\n*/g, '');

  // 6. 最終チェック: 開閉コメント数をログ出力
  const openParagraph = (result.match(/<!-- wp:paragraph[\s{>]/g) || []).length + (result.match(/<!-- wp:paragraph -->/g) || []).length;
  const closeParagraph = (result.match(/<!-- \/wp:paragraph -->/g) || []).length;
  const openHeading = (result.match(/<!-- wp:heading[\s{>]/g) || []).length + (result.match(/<!-- wp:heading -->/g) || []).length;
  const closeHeading = (result.match(/<!-- \/wp:heading -->/g) || []).length;

  if (openParagraph !== closeParagraph || openHeading !== closeHeading) {
    logger.warn(`sanitize後ブロック数: paragraph 開${openParagraph}/閉${closeParagraph}, heading 開${openHeading}/閉${closeHeading}`);
  } else {
    logger.info(`sanitize後ブロック数: paragraph ${openParagraph}対, heading ${openHeading}対 - OK`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// ★★★ Gutenberg整合性チェック＆自動修復 ★★★
// リライト後のHTMLが正しいGutenbergブロック形式かを検証し、問題があれば修復する
// ---------------------------------------------------------------------------

function validateAndRepairGutenberg(html) {
  let result = html;
  const issues = [];

  // --- チェック1: <p>で囲まれたブロックコメントが残っていないか ---
  const wrappedComments = (result.match(/<p[^>]*>\s*<!--\s*\/?\s*wp:/g) || []).length;
  if (wrappedComments > 0) {
    issues.push(`<p>囲みブロックコメント: ${wrappedComments}件`);
    result = unwrapBlockCommentsFromPTags(result);
  }

  // --- チェック2: 裸の<h2>/<h3>（wp:heading で囲まれていない） ---
  const nakedHeadings = result.match(
    /(?<!<!-- wp:heading(?:\s+\{[^}]*\})?\s*-->\s*)<h([2-6])\b[^>]*>[\s\S]*?<\/h\1>(?!\s*<!-- \/wp:heading -->)/g
  );
  if (nakedHeadings && nakedHeadings.length > 0) {
    issues.push(`裸の見出し: ${nakedHeadings.length}件`);
    result = repairMissingHeadingClose(result);
  }

  // --- チェック3: 裸の<p>（wp:paragraph で囲まれていない） ---
  const allPTags = (result.match(/<p[\s>]/g) || []).length;
  const wrappedPTags = (result.match(/<!-- wp:paragraph(?:\s+\{[^}]*\})?\s*-->\s*<p[\s>]/g) || []).length;
  const blockInnerPTags = (result.match(/<dd class="faq_a">\s*<!-- wp:paragraph/g) || []).length;
  const capBoxPTags = (result.match(/<div class="cap_box_content">\s*<!-- wp:paragraph/g) || []).length;
  const nakedPCount = allPTags - wrappedPTags - blockInnerPTags - capBoxPTags;

  if (nakedPCount > 3) {
    issues.push(`裸の<p>タグ: 約${nakedPCount}件`);
    result = wrapNakedParagraphs(result);
  }

  // --- チェック4: 段落閉じコメント欠落の最終修復 ---
  result = repairMissingParagraphClose(result);

  // --- チェック5: 孤立閉じコメントの最終除去 ---
  result = removeOrphanBlockComments(result);

  // --- チェック6: 開始/閉じコメントの数の不一致（ログのみ） ---
  const openHeading = (result.match(/<!-- wp:heading[\s{]/g) || []).length + (result.match(/<!-- wp:heading -->/g) || []).length;
  const closeHeading = (result.match(/<!-- \/wp:heading -->/g) || []).length;
  if (openHeading !== closeHeading) {
    issues.push(`wp:heading 開閉不一致: 開${openHeading} / 閉${closeHeading}`);
  }

  const openParagraph = (result.match(/<!-- wp:paragraph[\s{]/g) || []).length + (result.match(/<!-- wp:paragraph -->/g) || []).length;
  const closeParagraph = (result.match(/<!-- \/wp:paragraph -->/g) || []).length;
  if (openParagraph !== closeParagraph) {
    issues.push(`wp:paragraph 開閉不一致: 開${openParagraph} / 閉${closeParagraph}`);
  }

  // --- 結果ログ ---
  if (issues.length > 0) {
    logger.warn(`Gutenberg検証: ${issues.length}件の問題を検出・修復`);
    for (const issue of issues) {
      logger.warn(`  - ${issue}`);
    }
  } else {
    logger.info('Gutenberg検証: OK（問題なし）');
  }

  return result;
}

// 裸の<p>タグを <!-- wp:paragraph --> で囲む
function wrapNakedParagraphs(html) {
  // 各行を見て、<p>で始まるがwp:paragraphで囲まれていないものを検出して囲む
  const lines = html.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // <p>で始まる行を検出
    if (/^<p[\s>]/.test(trimmed) && trimmed.includes('</p>')) {
      // 前の行が <!-- wp:paragraph --> かチェック
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const isWrapped = /^<!-- wp:paragraph/.test(prevLine);

      // 次の行が <!-- /wp:paragraph --> かチェック
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const hasClose = /^<!-- \/wp:paragraph -->/.test(nextLine);

      if (!isWrapped && !hasClose) {
        // ブロック内部の<p>でないか確認（faq_a, cap_box_content, step__body内など）
        const contextBefore = result.slice(-3).join('\n');
        const isInsideBlock = /(?:faq_a|cap_box_content|step__body|balloon)/.test(contextBefore);

        if (!isInsideBlock) {
          result.push('<!-- wp:paragraph -->');
          result.push(line);
          result.push('<!-- /wp:paragraph -->');
          i++;
          continue;
        }
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// ★ UPDATED コメント除去（HTML破壊の防止）★
// ---------------------------------------------------------------------------

function removeUpdatedComments(html) {
  let result = html;

  // 正常な形式: <!-- UPDATED: ... -->
  result = result.replace(/<!--\s*UPDATED:.*?-->/g, '');

  // 壊れた形式: -- UPDATED: ... --&gt; （HTMLエンコードされた -->）
  result = result.replace(/--\s*UPDATED:.*?--&gt;/g, '');

  // 壊れた形式: <!--</p--> （UPDATED コメントの破壊残骸）
  result = result.replace(/<!--<\/p-->/g, '');

  // ★ 不正なブロックコメントを除去 ★
  // <!-- /wp:post-content --> や <!-- wp:post-content --> は記事本文に含まれるべきでない
  result = result.replace(/<!--\s*\/?wp:post-content\s*-->/g, '');
  // <!-- wp:template-part --> なども除去
  result = result.replace(/<!--\s*\/?wp:(?:template-part|site-title|site-tagline|query|post-template|post-excerpt)\s*(?:\{[^}]*\})?\s*-->/g, '');

  // 空の段落ブロックを除去（UPDATED除去後に残る空ブロック）
  result = result.replace(/<!-- wp:paragraph(?:\s+\{[^}]*\})?\s*-->\s*<p[^>]*>\s*<\/p>\s*<!-- \/wp:paragraph -->\n*/g, '');
  result = result.replace(/<!-- wp:paragraph(?:\s+\{[^}]*\})?\s*-->\s*<!-- \/wp:paragraph -->\n*/g, '');

  // 空の<strong>タグ除去（AIが冒頭に出力する残骸）
  result = result.replace(/<strong>\s*<\/strong>/g, '');

  return result;
}

// ---------------------------------------------------------------------------
// ★ <p>タグ欠落の修復（クラシック表示の主原因）★
// ---------------------------------------------------------------------------

function repairMissingPTags(html) {
  // <!-- wp:paragraph --> の後に <p> がない場合、<p>で囲む
  return html.replace(
    /<!-- wp:paragraph(\s+(\{[^}]*\}))?\s*-->\s*([\s\S]*?)\s*<!-- \/wp:paragraph -->/g,
    (match, _attrGroup, jsonStr, content) => {
      const trimmed = content.trim();

      // 既に<p>タグがある → そのまま
      if (trimmed.startsWith('<p')) return match;

      // 空コンテンツ → そのまま
      if (!trimmed) return match;

      // <p>以外のブロック要素で始まる → そのまま（wp:paragraph内にdivがある場合等）
      if (/^<(?:div|ul|ol|table|figure|blockquote)\b/i.test(trimmed)) return match;

      // JSON属性からclassNameを抽出
      let className = '';
      if (jsonStr) {
        try {
          const attrs = JSON.parse(jsonStr);
          className = attrs.className || '';
        } catch { /* */ }
      }

      const classAttr = className ? ` class="${className}"` : '';
      const openComment = jsonStr
        ? `<!-- wp:paragraph ${jsonStr} -->`
        : `<!-- wp:paragraph -->`;

      return `${openComment}\n<p${classAttr}>${trimmed}</p>\n<!-- /wp:paragraph -->`;
    }
  );
}

// ---------------------------------------------------------------------------
// ★ 壊れたURLの修復 ★
// ---------------------------------------------------------------------------

function cleanBrokenUrls(html) {
  // href内にHTML-encodedされたGutenbergコメントが混入した場合を修復
  // 例: href="https://example.com?&lt;/p&gt;&lt;!-- /wp:paragraph --&gt;...hl=ja"
  return html.replace(
    /href="([^"]*?)(&lt;[^"]*?)"/g,
    (match, validPart) => {
      // &lt; より前の部分だけを残す（それ以降は壊れたHTML）
      const cleaned = validPart.replace(/[?&]$/, '');
      logger.info(`壊れたURL修復: ${match.substring(0, 60)}... → href="${cleaned}"`);
      return `href="${cleaned}"`;
    }
  );
}

// ---------------------------------------------------------------------------
// 見出しにwp-block-headingクラスを確保
// ---------------------------------------------------------------------------

function ensureHeadingClass(html) {
  if (!html || html.includes('wp-block-heading')) return html;
  // 既にclass属性がある場合はwp-block-headingを追加
  if (/class="[^"]*"/i.test(html)) {
    return html.replace(/class="([^"]*)"/i, 'class="wp-block-heading $1"');
  }
  // class属性がない場合は新規追加
  return html.replace(/(<h[1-6])([\s>])/i, '$1 class="wp-block-heading"$2');
}

// HTML全体の見出しにwp-block-headingクラスを確保（軽量修正モード用）
function ensureAllHeadingClasses(html) {
  return html.replace(/<h([1-6])(\s[^>]*)?>/gi, (match, level, attrs) => {
    if (match.includes('wp-block-heading')) return match;
    if (attrs && /class="[^"]*"/i.test(attrs)) {
      return match.replace(/class="([^"]*)"/i, 'class="wp-block-heading $1"');
    }
    return `<h${level} class="wp-block-heading"${attrs || ''}>`;
  });
}

// ---------------------------------------------------------------------------
// ★ 見出しの <!-- /wp:heading --> 閉じコメント欠落を修復 ★
// AIが <!-- wp:heading --> を出力しても <!-- /wp:heading --> を忘れるケースがある
// また、<h2>/<h3>が裸で出力されるケース（開始コメントもない）も修復
// ---------------------------------------------------------------------------

function repairMissingHeadingClose(html) {
  let result = html;

  // パターン1: <!-- wp:heading ... --> があるが <!-- /wp:heading --> がない
  // ★ 修正: 負の先読みでは \s* のバックトラックで誤マッチするため、
  //   閉じコメントをオプショナルキャプチャして callback で判定する方式に変更
  result = result.replace(
    /(<!-- wp:heading(?:\s+\{[^}]*\})?\s*-->)\s*(<h([2-6])\b[^>]*>[\s\S]*?<\/h\3>)\s*(<!-- \/wp:heading -->)?/g,
    (match, openComment, headingTag, _level, closeComment) => {
      if (closeComment) return match; // 既に閉じコメントあり → 何もしない
      logger.info(`見出し閉じコメント修復: ${headingTag.substring(0, 50)}...`);
      return `${openComment}\n${headingTag}\n<!-- /wp:heading -->`;
    }
  );

  // パターン2: <h2>/<h3>が裸で出力（<!-- wp:heading --> も <!-- /wp:heading --> もない）
  // 前後に wp:heading コメントがない <h2>/<h3> を検出して囲む
  result = result.replace(
    /(?<!<!-- wp:heading(?:\s+\{[^}]*\})?\s*-->\s*)(<h([2-6])(\s[^>]*)?>)([\s\S]*?)(<\/h\2>)\s*(<!-- \/wp:heading -->)?/g,
    (match, openTag, level, attrs, content, closeTag, closeComment) => {
      if (closeComment) return match; // 既に閉じコメントあり → スキップ
      const levelAttr = level === '2' ? '' : ` {"level":${level}}`;
      logger.info(`裸の見出しをGutenbergブロック化: <h${level}>${content.substring(0, 30)}...`);
      return `<!-- wp:heading${levelAttr} -->\n${openTag}${content}${closeTag}\n<!-- /wp:heading -->`;
    }
  );

  return result;
}

// ---------------------------------------------------------------------------
// ★ 段落の <!-- /wp:paragraph --> 閉じコメント欠落を修復 ★
// AIが <!-- wp:paragraph --><p>...</p> を出力しても <!-- /wp:paragraph --> を忘れるケース
// これが wp:paragraph 開閉不一致の最大原因
// ---------------------------------------------------------------------------

function repairMissingParagraphClose(html) {
  // <!-- wp:paragraph --> ... <p>...</p> の後に <!-- /wp:paragraph --> がない場合に追加
  // ★ オプショナルキャプチャ方式で確実に判定 ★
  let result = html.replace(
    /(<!-- wp:paragraph(?:\s+\{[^}]*\})?\s*-->)\s*(<p[^>]*>[\s\S]*?<\/p>)\s*(<!-- \/wp:paragraph -->)?/g,
    (match, openComment, pTag, closeComment) => {
      if (closeComment) return match; // 既に閉じコメントあり
      return `${openComment}\n${pTag}\n<!-- /wp:paragraph -->`;
    }
  );

  return result;
}

// ---------------------------------------------------------------------------
// ★ 孤立した閉じコメントの除去 ★
// 対応する開始コメントのない <!-- /wp:xxx --> を除去する
// ---------------------------------------------------------------------------

function removeOrphanBlockComments(html) {
  const lines = html.split('\n');
  const result = [];
  const openStack = []; // 開始コメントのスタック
  let removedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 開始コメントを検出（自己閉じ /-->は除外）
    const openMatch = trimmed.match(/^<!-- wp:([\w\/-]+)(?:\s+\{[\s\S]*?\})?\s*-->$/);
    if (openMatch && !trimmed.includes('/-->')) {
      openStack.push({ blockType: openMatch[1], lineIndex: result.length });
      result.push(line);
      continue;
    }

    // 閉じコメントを検出
    const closeMatch = trimmed.match(/^<!-- \/(wp:[\w\/-]+) -->$/);
    if (closeMatch) {
      const closeType = closeMatch[1].replace(/^wp:/, '');

      // スタック内に対応する開始があるか探す（後方から）
      let found = false;
      for (let j = openStack.length - 1; j >= 0; j--) {
        if (openStack[j].blockType === closeType) {
          openStack.splice(j, 1);
          found = true;
          break;
        }
      }

      if (found) {
        result.push(line);
      } else {
        // 対応する開始がない孤立した閉じコメント → 除去
        removedCount++;
        logger.info(`孤立閉じコメント除去: ${trimmed}`);
      }
      continue;
    }

    result.push(line);
  }

  // スタックに残った開始コメント（対応する閉じがない）をログ出力
  if (openStack.length > 0) {
    logger.warn(`未閉の開始コメント: ${openStack.length}件`);
    for (const item of openStack.slice(0, 5)) {
      logger.warn(`  - wp:${item.blockType} (行 ${item.lineIndex + 1})`);
    }
  }

  if (removedCount > 0) {
    logger.info(`孤立閉じコメント: ${removedCount}件を除去`);
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// 1文1段落ルール
// ---------------------------------------------------------------------------

export function splitSentencesToParagraphs(html) {
  // JSON属性なしの<!-- wp:paragraph -->のみ対象（属性付きは元のスタイルを保持）
  return html.replace(
    /<!-- wp:paragraph -->\s*<p>([\s\S]*?)<\/p>\s*<!-- \/wp:paragraph -->/g,
    (match, content) => {
      if (content.length < 40) return match;
      // インラインHTMLタグ（span, a, strong等）を含む段落は分割しない（タグ破壊を防止）
      if (/<(?:span|a|strong|em|mark|code|sub|sup)\b/i.test(content)) return match;

      const sentences = content.split(/(?<=[。！？!?][）」』】)]?)\s*/).filter(Boolean);
      if (sentences.length <= 1) return match;

      return sentences
        .map((s) => `<!-- wp:paragraph -->\n<p>${s.trim()}</p>\n<!-- /wp:paragraph -->`)
        .join('\n\n');
    }
  );
}

// ---------------------------------------------------------------------------
// リンク検証 post-processing
// ---------------------------------------------------------------------------

export async function validateLinks(html, siteUrl, articleIndex = []) {
  const removedLinks = [];
  if (!html || !siteUrl) return { html, removedLinks };

  const knownUrls = new Set(
    articleIndex.map((a) => a.url?.toLowerCase().replace(/\/+$/, ''))
  );
  const siteUrlNormalized = siteUrl.replace(/\/+$/, '').toLowerCase();

  // ★ Regex ベースのリンク検証（cheerio 不使用 → Gutenbergコメントを100%保持）★
  const result = html.replace(
    /<a\s([^>]*?)href="([^"]*)"([^>]*?)>([\s\S]*?)<\/a>/gi,
    (match, before, href, after, text) => {
      if (!href || href.startsWith('#')) return match;

      try {
        const url = new URL(href, siteUrl);
        const fullUrl = url.href.toLowerCase().replace(/\/+$/, '');

        // 内部リンクかつ記事インデックスに存在しない場合のみ除去
        if (fullUrl.startsWith(siteUrlNormalized) && knownUrls.size > 0 && !knownUrls.has(fullUrl)) {
          removedLinks.push({ url: href, reason: 'not in article index' });
          return text; // <a>タグを除去してテキストのみ残す
        }
      } catch {
        // URL解析エラーはスキップ
      }

      return match; // そのまま残す
    }
  );

  if (removedLinks.length > 0) {
    logger.info(`リンク検証: ${removedLinks.length}件の不正リンクを除去`);
  }

  return { html: result, removedLinks };
}

// ---------------------------------------------------------------------------
// トップレベルHTML要素の分割（peek-ahead付き）
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
        current += html.substring(i, end + 3);
        i = end + 3;
        continue;
      }
    }

    // 開始タグ
    if (html[i] === '<' && html[i + 1] !== '/' && html[i + 1] !== '!') {
      const tagEnd = html.indexOf('>', i);
      if (tagEnd !== -1) {
        const tagContent = html.substring(i, tagEnd + 1);
        const tagNameMatch = tagContent.match(/^<(\w+)/);
        const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
        const selfClosing = tagContent.endsWith('/>') || VOID_TAGS.has(tagName);

        current += tagContent;
        if (!selfClosing) {
          depth++;
        } else if (depth === 0 && current.trim()) {
          elements.push(current.trim());
          current = '';
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
          // ★ Peek-ahead: 次のGutenberg閉じコメントを含める
          const remaining = html.substring(i);
          const peekMatch = remaining.match(/^\s*(<!-- \/wp:\S+ -->)/);
          if (peekMatch) {
            current += peekMatch[0];
            i += peekMatch[0].length;
          }

          elements.push(current.trim());
          current = '';
          depth = 0;
        }
        continue;
      }
    }

    current += html[i];
    i++;
  }

  if (current.trim()) {
    elements.push(current.trim());
  }

  return elements;
}

// ---------------------------------------------------------------------------
// ヘルパー: SWELL要素からタイトルを抽出
// ---------------------------------------------------------------------------

function extractTitle($, $el) {
  const selectors = ['> p:first-child', '> strong:first-child', '> span:first-child', '> h3:first-child', '> h4:first-child'];
  for (const sel of selectors) {
    const $title = $el.find(sel);
    if ($title.length > 0) {
      const text = $title.text().trim();
      $title.remove();
      return text;
    }
  }
  // data-titleから
  return $el.attr('data-title') || 'ポイント';
}
