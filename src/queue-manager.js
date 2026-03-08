import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSiteDataPath } from './site-manager.js';
import { getArticle } from './article-fetcher.js';
import logger from './logger.js';

// ---------------------------------------------------------------------------
// キューデータのパス
// ---------------------------------------------------------------------------

function getQueuePath(siteId) {
  return resolve(getSiteDataPath(siteId), 'queue.json');
}

// ---------------------------------------------------------------------------
// キュー読み込み
// ---------------------------------------------------------------------------

export function loadQueue(siteId) {
  const filePath = getQueuePath(siteId);
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// キュー保存
// ---------------------------------------------------------------------------

function saveQueue(siteId, queue) {
  const filePath = getQueuePath(siteId);
  writeFileSync(filePath, JSON.stringify(queue, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// キューに記事追加
// ---------------------------------------------------------------------------

export function addToQueue(siteId, articleWpId, options = {}) {
  const queue = loadQueue(siteId);

  // 重複チェック
  if (queue.some((item) => item.articleWpId === articleWpId && item.status !== 'completed' && item.status !== 'failed')) {
    logger.warn(`記事 ${articleWpId} は既にキューに存在します`);
    return null;
  }

  const article = getArticle(siteId, articleWpId);
  const item = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    articleWpId,
    title: article?.title || `記事#${articleWpId}`,
    score: article?.score ?? null,
    status: 'pending', // pending, processing, completed, failed
    priority: options.priority || 'normal', // high, normal, low
    addedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
  };

  queue.push(item);
  saveQueue(siteId, queue);
  logger.info(`キューに追加: ${item.title} (${siteId})`);

  return item;
}

// ---------------------------------------------------------------------------
// キューから複数記事を一括追加
// ---------------------------------------------------------------------------

export function addBatchToQueue(siteId, articleWpIds, options = {}) {
  const added = [];
  for (const wpId of articleWpIds) {
    const item = addToQueue(siteId, wpId, options);
    if (item) added.push(item);
  }
  return added;
}

// ---------------------------------------------------------------------------
// キューアイテムのステータス更新
// ---------------------------------------------------------------------------

export function updateQueueItem(siteId, queueId, updates) {
  const queue = loadQueue(siteId);
  const item = queue.find((q) => q.id === queueId);
  if (!item) return null;

  Object.assign(item, updates);
  saveQueue(siteId, queue);
  return item;
}

// ---------------------------------------------------------------------------
// キューの次の処理対象を取得
// ---------------------------------------------------------------------------

export function getNextInQueue(siteId) {
  const queue = loadQueue(siteId);

  // 処理中のものがあればスキップ
  if (queue.some((q) => q.status === 'processing')) return null;

  // 優先度順 → 追加順
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  const pending = queue
    .filter((q) => q.status === 'pending')
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.addedAt) - new Date(b.addedAt);
    });

  return pending[0] || null;
}

// ---------------------------------------------------------------------------
// キューアイテム削除
// ---------------------------------------------------------------------------

export function removeFromQueue(siteId, queueId) {
  const queue = loadQueue(siteId);
  const index = queue.findIndex((q) => q.id === queueId);
  if (index === -1) return false;

  const removed = queue.splice(index, 1)[0];
  saveQueue(siteId, queue);
  logger.info(`キューから削除: ${removed.title} (${siteId})`);
  return true;
}

// ---------------------------------------------------------------------------
// キュークリア（完了・失敗のみ）
// ---------------------------------------------------------------------------

export function clearCompletedQueue(siteId) {
  const queue = loadQueue(siteId);
  const remaining = queue.filter((q) => q.status === 'pending' || q.status === 'processing');
  saveQueue(siteId, remaining);
  return queue.length - remaining.length;
}

// ---------------------------------------------------------------------------
// キュー統計
// ---------------------------------------------------------------------------

export function getQueueStats(siteId) {
  const queue = loadQueue(siteId);
  return {
    total: queue.length,
    pending: queue.filter((q) => q.status === 'pending').length,
    processing: queue.filter((q) => q.status === 'processing').length,
    completed: queue.filter((q) => q.status === 'completed').length,
    failed: queue.filter((q) => q.status === 'failed').length,
  };
}
