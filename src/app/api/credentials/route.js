import { NextResponse } from 'next/server';
import config from '@/config.js';

// GET /api/credentials - Gemini API設定状態チェック
export async function GET() {
  const hasApiKey = !!config.gemini.apiKey && !config.gemini.apiKey.startsWith('your_');

  return NextResponse.json({
    isConfigured: hasApiKey,
    geminiApiKey: hasApiKey ? config.gemini.apiKey.slice(0, 6) + '***' : '',
    textModel: config.gemini.textModel,
    imageModel: config.gemini.imageModel,
  });
}
