import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '..');

function getEnv(key, fallback = '') {
  return process.env[key] || fallback;
}

const config = {
  gemini: {
    apiKey: getEnv('GEMINI_API_KEY'),
    textModel: getEnv('GEMINI_TEXT_MODEL', 'gemini-2.5-flash-preview-05-20'),
    imageModel: getEnv('GEMINI_IMAGE_MODEL', 'gemini-2.0-flash-preview-image-generation'),
  },
  logLevel: getEnv('LOG_LEVEL', 'info'),
  paths: {
    root: PROJECT_ROOT,
    data: resolve(PROJECT_ROOT, 'data'),
    sites: resolve(PROJECT_ROOT, 'data', 'sites'),
    sitesJson: resolve(PROJECT_ROOT, 'data', 'sites.json'),
    logs: resolve(PROJECT_ROOT, 'logs'),
    prompts: resolve(PROJECT_ROOT, 'prompts'),
    promptDefaults: resolve(PROJECT_ROOT, 'prompts', 'defaults'),
  },
};

export default config;
