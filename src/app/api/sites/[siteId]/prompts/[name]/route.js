import { NextResponse } from 'next/server';
import { loadPrompt, savePrompt, getTemplateNames } from '@/prompt-manager';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import config from '@/config';

// GET: 単一プロンプト取得
export async function GET(request, { params }) {
  try {
    const { siteId, name } = await params;

    const templateNames = getTemplateNames();
    if (!templateNames.includes(name)) {
      return NextResponse.json({ error: '不明なプロンプト名です' }, { status: 404 });
    }

    const content = loadPrompt(name, siteId);

    // デフォルトの内容も取得（リセット用）
    const defaultPath = resolve(config.paths.promptDefaults, `${name}.md`);
    const defaultContent = existsSync(defaultPath)
      ? readFileSync(defaultPath, 'utf-8')
      : '';

    return NextResponse.json({
      name,
      content,
      defaultContent,
      isCustomized: content !== defaultContent,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: プロンプト更新
export async function PUT(request, { params }) {
  try {
    const { siteId, name } = await params;
    const body = await request.json();

    const templateNames = getTemplateNames();
    if (!templateNames.includes(name)) {
      return NextResponse.json({ error: '不明なプロンプト名です' }, { status: 404 });
    }

    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'プロンプト内容が必要です' }, { status: 400 });
    }

    // リセットの場合
    if (body.reset) {
      const defaultPath = resolve(config.paths.promptDefaults, `${name}.md`);
      if (existsSync(defaultPath)) {
        const defaultContent = readFileSync(defaultPath, 'utf-8');
        savePrompt(name, defaultContent, siteId);
        return NextResponse.json({ name, content: defaultContent, reset: true });
      }
    }

    savePrompt(name, body.content, siteId);
    return NextResponse.json({ name, content: body.content, saved: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
