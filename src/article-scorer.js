import logger from './logger.js';

// ---------------------------------------------------------------------------
// スコアリング基準（情報鮮度を最重視）
// ---------------------------------------------------------------------------

/**
 * 記事のリライト優先度スコアを計算（0-100, 高い=優先度高）
 */
export function scoreArticle(article, options = {}) {
  let score = 0;
  const details = [];

  // ---------------------------------------------------------------------------
  // 1. 最終更新からの経過日数（0-30点）
  // ---------------------------------------------------------------------------
  const modifiedAt = article.modifiedAt || article.publishedAt;
  if (modifiedAt) {
    const monthsSinceUpdate = getMonthsSince(modifiedAt);

    if (monthsSinceUpdate >= 12) {
      score += 30;
      details.push(`更新から${Math.floor(monthsSinceUpdate)}ヶ月経過 (+30)`);
    } else if (monthsSinceUpdate >= 6) {
      score += 20;
      details.push(`更新から${Math.floor(monthsSinceUpdate)}ヶ月経過 (+20)`);
    } else if (monthsSinceUpdate >= 3) {
      score += 10;
      details.push(`更新から${Math.floor(monthsSinceUpdate)}ヶ月経過 (+10)`);
    } else {
      score += 3;
      details.push(`最近更新済み (+3)`);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. 記事カテゴリ / キーワード傾向（0-20点）
  //    ツール・サービス紹介記事は情報が古くなりやすいため高優先
  // ---------------------------------------------------------------------------
  const title = (article.title || '').toLowerCase();
  const toolKeywords = [
    '比較', 'おすすめ', 'レビュー', '料金', 'プラン', '使い方',
    'ツール', 'サービス', 'アプリ', 'ソフト', '代替', '無料',
    'ai', 'chatgpt', 'gemini', 'claude', 'openai', 'wordpress',
    'サーバー', 'ドメイン', 'テーマ', 'プラグイン',
  ];

  const matchCount = toolKeywords.filter((kw) => title.includes(kw)).length;
  if (matchCount >= 3) {
    score += 20;
    details.push(`ツール/サービス系記事 (+20)`);
  } else if (matchCount >= 1) {
    score += 10;
    details.push(`ツール関連キーワードあり (+10)`);
  } else {
    score += 5;
    details.push(`一般記事 (+5)`);
  }

  // ---------------------------------------------------------------------------
  // 3. 構造品質（0-20点）
  // ---------------------------------------------------------------------------
  if (!article.hasFaq) {
    score += 10;
    details.push(`FAQセクションなし (+10)`);
  }
  if ((article.h2Count || 0) < 3) {
    score += 5;
    details.push(`H2見出し不足: ${article.h2Count || 0}個 (+5)`);
  }
  if ((article.imgCount || 0) === 0) {
    score += 5;
    details.push(`画像なし (+5)`);
  }

  // ---------------------------------------------------------------------------
  // 4. 文字数（0-15点）
  // ---------------------------------------------------------------------------
  const wordCount = article.wordCount || 0;
  if (wordCount < 500) {
    score += 15;
    details.push(`文字数不足: ${wordCount}字 (+15)`);
  } else if (wordCount < 1000) {
    score += 10;
    details.push(`文字数少なめ: ${wordCount}字 (+10)`);
  } else if (wordCount < 1500) {
    score += 5;
    details.push(`文字数やや少なめ: ${wordCount}字 (+5)`);
  }

  // ---------------------------------------------------------------------------
  // 5. リンク健全性（0-15点）
  //    ※ リンクチェックは別途実行するため、ここでは基本判定のみ
  // ---------------------------------------------------------------------------
  if ((article.linkCount || 0) === 0) {
    score += 10;
    details.push(`リンクなし (+10)`);
  }
  if (!article.hasExcerpt || (article.excerptLength || 0) < 50) {
    score += 5;
    details.push(`抜粋なし/短い (+5)`);
  }

  // 100点上限
  const finalScore = Math.min(100, score);

  return {
    score: finalScore,
    details,
    grade: getGrade(finalScore),
  };
}

// ---------------------------------------------------------------------------
// 全記事スコアリング
// ---------------------------------------------------------------------------

export function scoreAllArticles(articles) {
  return articles.map((article) => {
    const result = scoreArticle(article);
    return {
      ...article,
      score: result.score,
      scoreGrade: result.grade,
      scoreDetails: result.details,
    };
  }).sort((a, b) => b.score - a.score); // 高スコア順
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function getMonthsSince(dateString) {
  const then = new Date(dateString);
  const now = new Date();
  return (now - then) / (1000 * 60 * 60 * 24 * 30);
}

function getGrade(score) {
  if (score >= 70) return 'critical';   // 緊急（赤）
  if (score >= 50) return 'high';       // 高（オレンジ）
  if (score >= 30) return 'medium';     // 中（黄）
  return 'low';                          // 低（緑）
}
