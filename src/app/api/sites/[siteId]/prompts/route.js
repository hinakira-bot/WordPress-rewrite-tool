import { NextResponse } from 'next/server';
import { listPrompts, loadPrompt, getTemplateNames } from '@/prompt-manager';

// GET: プロンプト一覧取得
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const prompts = listPrompts(siteId);

    // 各プロンプトの内容も取得
    const promptsWithContent = prompts.map((p) => {
      try {
        const content = loadPrompt(p.name, siteId);
        return { ...p, content, preview: content.slice(0, 200) };
      } catch {
        return { ...p, content: '', preview: '' };
      }
    });

    return NextResponse.json({ prompts: promptsWithContent });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
