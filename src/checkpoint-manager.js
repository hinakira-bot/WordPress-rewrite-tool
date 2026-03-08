import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSiteDataPath } from './site-manager.js';
import logger from './logger.js';

// ---------------------------------------------------------------------------
// チェックポイントのパス
// ---------------------------------------------------------------------------

function getCheckpointPath(siteId) {
  return resolve(getSiteDataPath(siteId), 'checkpoint.json');
}

// ---------------------------------------------------------------------------
// チェックポイント読み込み
// ---------------------------------------------------------------------------

export function loadCheckpoint(siteId) {
  const filePath = getCheckpointPath(siteId);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// チェックポイント保存
// ---------------------------------------------------------------------------

export function saveCheckpoint(siteId, data) {
  const filePath = getCheckpointPath(siteId);
  const checkpoint = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  return checkpoint;
}

// ---------------------------------------------------------------------------
// チェックポイントクリア
// ---------------------------------------------------------------------------

export function clearCheckpoint(siteId) {
  const filePath = getCheckpointPath(siteId);
  if (existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify(null), 'utf-8');
    logger.info(`チェックポイントクリア: ${siteId}`);
  }
}

// ---------------------------------------------------------------------------
// リライト履歴の管理
// ---------------------------------------------------------------------------

function getHistoryPath(siteId) {
  return resolve(getSiteDataPath(siteId), 'history.json');
}

export function loadHistory(siteId) {
  const filePath = getHistoryPath(siteId);
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

export function addHistoryEntry(siteId, entry) {
  const history = loadHistory(siteId);
  const record = {
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    articleWpId: entry.articleWpId,
    title: entry.title,
    score: entry.score ?? null,
    updateMethod: entry.updateMethod || 'draft',
    elapsed: entry.elapsed || 0,
    changes: entry.changes || {},
    freshnessIssues: entry.freshnessIssues || 0,
    linksFixed: entry.linksFixed || 0,
    faqAdded: entry.faqAdded || false,
    success: entry.success !== false,
    error: entry.error || null,
    executedAt: new Date().toISOString(),
    triggeredBy: entry.triggeredBy || 'manual', // manual, auto, queue
  };

  history.unshift(record); // 新しい順

  // 最大500件に制限
  if (history.length > 500) {
    history.length = 500;
  }

  const filePath = getHistoryPath(siteId);
  writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
  logger.info(`履歴追加: ${record.title} (${siteId})`);

  return record;
}

export function getHistoryStats(siteId) {
  const history = loadHistory(siteId);
  const last30Days = history.filter((h) => {
    const date = new Date(h.executedAt);
    return Date.now() - date.getTime() < 30 * 24 * 60 * 60 * 1000;
  });

  return {
    total: history.length,
    last30Days: last30Days.length,
    successRate: history.length > 0
      ? Math.round((history.filter((h) => h.success).length / history.length) * 100)
      : 0,
    totalFreshnessIssues: history.reduce((sum, h) => sum + (h.freshnessIssues || 0), 0),
    totalLinksFixed: history.reduce((sum, h) => sum + (h.linksFixed || 0), 0),
  };
}
