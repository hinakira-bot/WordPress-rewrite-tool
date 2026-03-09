import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSiteDataPath } from './site-manager.js';
import logger from './logger.js';

const DEFAULT_SETTINGS = {
  rewrite: {
    defaultMode: 'minimal', // minimal, partial, full
    updateMethod: 'draft', // draft, publish
    articlesPerDay: 3,
    cronSchedule: '0 10 * * *',
  },
  scoring: {
    minScoreForAutoRewrite: 50,
  },
  content: {
    preserveImages: true,
    generateNewImages: false,
    language: 'ja',
    linkStyle: 'text', // text: 自然なテキストリンク, decorative: 元の装飾(ボタン・ブログカード)維持
  },
  swell: {
    enabled: true,
    faqBlock: true,
  },
};

function getSettingsPath(siteId) {
  return resolve(getSiteDataPath(siteId), 'settings.json');
}

export function loadSiteSettings(siteId) {
  const filePath = getSettingsPath(siteId);
  if (!existsSync(filePath)) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return deepMerge(DEFAULT_SETTINGS, data);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSiteSettings(siteId, settings) {
  const filePath = getSettingsPath(siteId);
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  logger.info(`サイト設定保存: ${siteId}`);
}

export function getSiteSetting(siteId, path, defaultValue) {
  const settings = loadSiteSettings(siteId);
  const keys = path.split('.');
  let current = settings;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return defaultValue;
    current = current[key];
  }
  return current !== undefined ? current : defaultValue;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
