import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './config.js';
import logger from './logger.js';
import { loadPrompt, renderPrompt } from './prompt-manager.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} タイムアウト (${ms / 1000}秒)`)), ms)
    ),
  ]);
}

async function generateWithRetry(model, prompt, { timeoutMs = 180_000, label = 'API' } = {}) {
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

// ---------------------------------------------------------------------------
// balloonID抽出（元記事から吹き出しキャラクターIDを自動抽出）
// ---------------------------------------------------------------------------

function extractBalloonIds(htmlContent) {
  if (!htmlContent) return [];
  const ids = new Set();
  const regex = /<!-- wp:loos\/balloon\s+\{[^}]*"balloonID"\s*:\s*"(\d+)"[^}]*\}/g;
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// リライト生成
// ---------------------------------------------------------------------------

export async function generateRewrite({
  article,
  freshnessReport,
  internalLinkAudit,
  externalLinkAudit,
  externalLinkResearch,
  siteId,
  rewriteMode,
  onProgress,
}) {
  logger.info(`リライト生成: "${article.title}" (モード: ${rewriteMode || 'minimal'})`);
  onProgress?.({ message: 'リライト記事を生成中...' });

  const model = genAI.getGenerativeModel({ model: config.gemini.textModel });

  let template;
  try {
    template = loadPrompt('rewrite-update', siteId);
  } catch {
    template = getDefaultRewritePrompt();
  }

  // 調査結果を整形
  const freshnessData = formatFreshnessData(freshnessReport);
  const linkData = formatLinkData(internalLinkAudit, externalLinkAudit, externalLinkResearch);

  // 元記事からballoonIDを自動抽出
  const balloonIds = extractBalloonIds(article.content);
  if (balloonIds.length > 0) {
    logger.info(`balloonID検出: ${balloonIds.join(', ')}`);
  } else {
    logger.info('balloonID: 元記事に吹き出しブロックなし');
  }

  // FAQ有無 + リライトモード + リンクスタイル + balloonIdsをAIに伝える
  const prompt = renderPrompt(template, {
    title: article.title,
    originalContent: article.content,
    freshnessData,
    linkData,
    hasFaq: article.hasFaq ? 'true' : '',
    rewriteMode: rewriteMode || 'minimal',
    linkStyle: article.linkStyle || 'text',
    balloonIds: balloonIds.length > 0 ? balloonIds.join(', ') : '',
  });

  const result = await generateWithRetry(model, prompt, {
    timeoutMs: 300_000,
    label: 'リライト生成',
  });

  const rewrittenHtml = result.response.text();

  // HTML部分を抽出（マークダウンのコードブロックがある場合）
  let cleanedHtml = rewrittenHtml;
  const htmlMatch = rewrittenHtml.match(/```html\s*([\s\S]*?)```/);
  if (htmlMatch) {
    cleanedHtml = htmlMatch[1].trim();
  } else {
    cleanedHtml = rewrittenHtml.replace(/```\s*/g, '').trim();
  }

  logger.info(`リライト生成完了: ${cleanedHtml.length}文字`);
  onProgress?.({ message: 'リライト記事の生成が完了しました' });

  return {
    title: article.title,
    content: cleanedHtml,
    originalLength: article.content?.length || 0,
    rewrittenLength: cleanedHtml.length,
  };
}

// ---------------------------------------------------------------------------
// フォーマッター
// ---------------------------------------------------------------------------

function formatFreshnessData(report) {
  if (!report) return '調査なし';

  const lines = [];
  lines.push(`## 最新情報調査結果 (${report.outdatedCount || 0}件の更新が必要)`);

  // Phase 1: 競合分析結果
  if (report.competitorAnalysis) {
    const ca = report.competitorAnalysis;
    if (ca.missingTopics?.length > 0) {
      lines.push('\n### 競合記事に書かれていて、この記事に不足しているトピック:');
      for (const topic of ca.missingTopics) {
        lines.push(`- **${topic.topic || topic}**: ${topic.description || '競合が扱っているが当記事では未言及'}`);
      }
    }
    if (ca.latestUpdates?.length > 0) {
      lines.push('\n### 競合記事で確認された最新情報:');
      for (const update of ca.latestUpdates) {
        lines.push(`- ${update.topic || update}: ${update.detail || ''}`);
      }
    }
  }

  // Phase 2: ファクトチェック結果
  if (report.factChecks?.length > 0) {
    lines.push('\n### 情報の変更点（ファクトチェック済）:');
    for (const fc of report.factChecks) {
      if (fc.changed) {
        lines.push(`- **変更:** "${fc.original}" → "${fc.current}" (出典: ${fc.source || '不明'})`);
      }
    }
  }

  // Phase 3: 最新ニュース・公式発表
  if (report.latestNews) {
    const ln = report.latestNews;
    if (ln.versionUpdates?.length > 0) {
      lines.push('\n### 最新バージョン・アップデート情報:');
      for (const vu of ln.versionUpdates) {
        lines.push(`- **${vu.service || vu.name || 'サービス'}**: ${vu.update || vu.detail || vu.description || ''} (出典: ${vu.source || '公式'})`);
      }
    }
    if (ln.pricingChanges?.length > 0) {
      lines.push('\n### 料金変更情報:');
      for (const pc of ln.pricingChanges) {
        lines.push(`- **${pc.service || pc.name}**: ${pc.change || pc.detail || pc.description || ''}`);
      }
    }
    if (ln.newFeatures?.length > 0) {
      lines.push('\n### 新機能情報:');
      for (const nf of ln.newFeatures) {
        lines.push(`- **${nf.service || nf.name}**: ${nf.feature || nf.detail || nf.description || ''}`);
      }
    }
  }

  if (report.newInfo?.length > 0) {
    lines.push('\n### 追加すべき新情報:');
    for (const info of report.newInfo) {
      lines.push(`- ${info.topic}: ${info.description}`);
    }
  }

  if (report.recommendations?.length > 0) {
    lines.push('\n### 推奨アクション:');
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join('\n');
}

function formatLinkData(internalAudit, externalAudit, externalResearch) {
  const lines = [];

  if (internalAudit) {
    lines.push('## 内部リンク調査結果');
    if (internalAudit.deadCount > 0) {
      lines.push(`\n### リンク切れ (${internalAudit.deadCount}件):`);
      for (const link of internalAudit.existing.filter((l) => l.status === 'dead')) {
        const action = link.suggestion
          ? `→ 代替: [${link.suggestion.title}](${link.suggestion.url})`
          : '→ 削除してください';
        lines.push(`- "${link.text}" (${link.href}) ${action}`);
      }
    }
    if (internalAudit.suggestedAdditions?.length > 0) {
      lines.push('\n### 追加すべき内部リンク:');
      for (const s of internalAudit.suggestedAdditions) {
        lines.push(`- [${s.title}](${s.url}) - ${s.reason}`);
      }
    }
  }

  if (externalAudit?.deadCount > 0) {
    lines.push('\n## 外部リンク切れ');
    for (const link of externalAudit.existing.filter((l) => l.status === 'dead')) {
      lines.push(`- "${link.text}" (${link.href}) → 削除または差し替え`);
    }
  }

  if (externalResearch?.suggestedLinks?.length > 0) {
    lines.push('\n## 追加推奨の外部リンク');
    for (const s of externalResearch.suggestedLinks) {
      lines.push(`- [${s.title}](${s.url}) - ${s.reason} (挿入場所: ${s.insertLocation || '適切な箇所'})`);
    }
  }

  return lines.join('\n') || '調査なし';
}

// ---------------------------------------------------------------------------
// デフォルトプロンプト
// ---------------------------------------------------------------------------

function getDefaultRewritePrompt() {
  return `あなたはSEOとコンテンツマーケティングの専門家です。以下のブログ記事を、調査結果に基づいてリライトしてください。

## 重要な原則
1. **元の記事構成・トーン・文体は最大限維持**してください
2. **古い情報を最新情報に差し替え**てください（最重要）
3. **リンク切れは削除または代替リンクに差し替え**てください
4. **推奨された内部リンク・外部リンクを自然に挿入**してください
5. 不自然なリンクの挿入は避けてください
6. HTML形式で出力してください（Gutenbergブロック形式推奨）

## 元の記事タイトル
{{title}}

## 元の記事本文（HTML）
{{originalContent}}

## 最新情報調査データ
{{freshnessData}}

## リンク調査データ
{{linkData}}

{{#if hasFaq}}
## 追加するFAQセクション（この内容を記事末尾、まとめの前に挿入）
{{faqHtml}}
{{/if}}

## 出力
リライト後の記事HTML全文を出力してください。\`\`\`html で囲んでください。
変更箇所にはHTMLコメント <!-- UPDATED: 変更理由 --> を付与してください。`;
}
