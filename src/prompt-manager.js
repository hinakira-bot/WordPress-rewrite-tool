import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import config from './config.js';
import { getSiteDataPath } from './site-manager.js';
import logger from './logger.js';

const DEFAULTS_DIR = config.paths.promptDefaults;
const GLOBAL_DIR = config.paths.prompts;

const TEMPLATE_NAMES = [
  'freshness-check',
  'link-audit',
  'faq-generate',
  'rewrite-update',
  'external-link-research',
];

/**
 * プロンプトテンプレートを読み込む（3段階優先度）
 * 1. サイト別 → 2. グローバル → 3. デフォルト
 */
export function loadPrompt(name, siteId = null) {
  if (siteId) {
    const sitePath = resolve(getSiteDataPath(siteId), 'prompts', `${name}.md`);
    if (existsSync(sitePath)) return readFileSync(sitePath, 'utf-8');
  }

  const globalPath = resolve(GLOBAL_DIR, `${name}.md`);
  if (existsSync(globalPath)) return readFileSync(globalPath, 'utf-8');

  const defaultPath = resolve(DEFAULTS_DIR, `${name}.md`);
  if (existsSync(defaultPath)) return readFileSync(defaultPath, 'utf-8');

  logger.error(`プロンプトテンプレートが見つかりません: ${name}`);
  throw new Error(`Prompt template not found: ${name}`);
}

/**
 * テンプレートに変数を埋め込む
 */
export function renderPrompt(template, variables = {}) {
  let result = template;

  // 条件ブロック
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName, content) => {
      const val = variables[varName];
      return val && String(val).trim() ? content : '';
    }
  );

  // 変数置換
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value ?? '');
  }

  // 未置換の変数を除去
  result = result.replace(/\{\{[a-zA-Z_]+\}\}/g, '');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * テンプレート一覧と状態
 */
export function listPrompts(siteId = null) {
  return TEMPLATE_NAMES.map((name) => {
    const defaultPath = resolve(DEFAULTS_DIR, `${name}.md`);
    const globalPath = resolve(GLOBAL_DIR, `${name}.md`);
    let hasCustom = false;

    if (siteId) {
      const sitePath = resolve(getSiteDataPath(siteId), 'prompts', `${name}.md`);
      hasCustom = existsSync(sitePath);
    }
    if (!hasCustom) hasCustom = existsSync(globalPath);

    return {
      name,
      status: hasCustom ? 'customized' : 'default',
      hasDefault: existsSync(defaultPath),
    };
  });
}

/**
 * プロンプト保存（サイト別）
 */
export function savePrompt(name, content, siteId = null) {
  let filePath;
  if (siteId) {
    const promptDir = resolve(getSiteDataPath(siteId), 'prompts');
    if (!existsSync(promptDir)) {
      mkdirSync(promptDir, { recursive: true });
    }
    filePath = resolve(promptDir, `${name}.md`);
  } else {
    filePath = resolve(GLOBAL_DIR, `${name}.md`);
  }
  writeFileSync(filePath, content, 'utf-8');
  logger.info(`プロンプト保存: ${name}${siteId ? ` (site: ${siteId})` : ''}`);
}

export function getTemplateNames() {
  return [...TEMPLATE_NAMES];
}
