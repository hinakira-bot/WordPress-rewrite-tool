import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import config from './config.js';
import logger from './logger.js';

const SITES_PATH = config.paths.sitesJson;

// ---------------------------------------------------------------------------
// Helper: ID 生成
// ---------------------------------------------------------------------------

function generateSiteId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'site_';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ---------------------------------------------------------------------------
// Helper: サイトデータディレクトリの確保
// ---------------------------------------------------------------------------

function ensureSiteDataDir(siteId) {
  const siteDir = resolve(config.paths.sites, siteId);
  if (!existsSync(siteDir)) {
    mkdirSync(siteDir, { recursive: true });
  }
  return siteDir;
}

// ---------------------------------------------------------------------------
// 全サイト読み込み
// ---------------------------------------------------------------------------

export function loadSites() {
  if (!existsSync(SITES_PATH)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(SITES_PATH, 'utf-8'));
  } catch (err) {
    logger.warn(`sites.json 読み込みエラー: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 全サイト保存
// ---------------------------------------------------------------------------

function saveSites(sites) {
  const dir = config.paths.data;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SITES_PATH, JSON.stringify(sites, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// サイト取得（単体）
// ---------------------------------------------------------------------------

export function getSite(siteId) {
  const sites = loadSites();
  return sites.find((s) => s.id === siteId) || null;
}

// ---------------------------------------------------------------------------
// サイト追加
// ---------------------------------------------------------------------------

export function addSite({ name, url, username, appPassword }) {
  const sites = loadSites();

  // URL正規化
  const normalizedUrl = url.replace(/\/+$/, '');

  // 重複チェック
  const existing = sites.find(
    (s) => s.url.replace(/\/+$/, '').toLowerCase() === normalizedUrl.toLowerCase()
  );
  if (existing) {
    throw new Error(`このURLは既に登録されています: ${existing.name}`);
  }

  const id = generateSiteId();
  const site = {
    id,
    name: name || normalizedUrl,
    url: normalizedUrl,
    username,
    appPassword,
    createdAt: new Date().toISOString(),
    lastSyncAt: null,
    articleCount: 0,
    rewrittenCount: 0,
    status: 'active',
  };

  // サイト別データディレクトリ作成
  ensureSiteDataDir(id);

  sites.push(site);
  saveSites(sites);
  logger.info(`サイト追加: ${name} (${normalizedUrl}) → ID=${id}`);

  return site;
}

// ---------------------------------------------------------------------------
// サイト更新
// ---------------------------------------------------------------------------

export function updateSite(siteId, updates) {
  const sites = loadSites();
  const index = sites.findIndex((s) => s.id === siteId);

  if (index === -1) {
    throw new Error(`サイトが見つかりません: ${siteId}`);
  }

  // 更新可能フィールド
  const allowed = ['name', 'url', 'username', 'appPassword', 'status'];
  for (const key of allowed) {
    if (updates[key] !== undefined && updates[key] !== '') {
      sites[index][key] = key === 'url' ? updates[key].replace(/\/+$/, '') : updates[key];
    }
  }

  saveSites(sites);
  logger.info(`サイト更新: ${siteId}`);

  return sites[index];
}

// ---------------------------------------------------------------------------
// サイト削除
// ---------------------------------------------------------------------------

export function deleteSite(siteId) {
  const sites = loadSites();
  const index = sites.findIndex((s) => s.id === siteId);

  if (index === -1) {
    throw new Error(`サイトが見つかりません: ${siteId}`);
  }

  const removed = sites.splice(index, 1)[0];
  saveSites(sites);
  logger.info(`サイト削除: ${removed.name} (${siteId})`);

  return removed;
}

// ---------------------------------------------------------------------------
// サイト統計更新
// ---------------------------------------------------------------------------

export function updateSiteStats(siteId, stats) {
  const sites = loadSites();
  const index = sites.findIndex((s) => s.id === siteId);

  if (index === -1) return;

  if (stats.lastSyncAt !== undefined) sites[index].lastSyncAt = stats.lastSyncAt;
  if (stats.articleCount !== undefined) sites[index].articleCount = stats.articleCount;
  if (stats.rewrittenCount !== undefined) sites[index].rewrittenCount = stats.rewrittenCount;

  saveSites(sites);
}

// ---------------------------------------------------------------------------
// サイトデータディレクトリパス取得
// ---------------------------------------------------------------------------

export function getSiteDataPath(siteId) {
  return ensureSiteDataDir(siteId);
}
