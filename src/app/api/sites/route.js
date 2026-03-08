import { NextResponse } from 'next/server';
import { loadSites, addSite } from '@/site-manager.js';
import { WordPressClient } from '@/wordpress-client.js';

// GET /api/sites - 全サイト一覧
export async function GET() {
  try {
    const sites = loadSites();
    // パスワードをマスク
    const masked = sites.map((s) => ({
      ...s,
      appPassword: s.appPassword ? s.appPassword.slice(0, 4) + ' ****' : '',
    }));
    return NextResponse.json(masked);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/sites - サイト追加
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, url, username, appPassword, testConnection } = body;

    if (!url || !username || !appPassword) {
      return NextResponse.json(
        { error: 'URL、ユーザー名、アプリケーションパスワードは必須です' },
        { status: 400 }
      );
    }

    // 接続テスト（オプション）
    if (testConnection) {
      const client = new WordPressClient(url, username, appPassword);
      const result = await client.testConnection();
      if (!result.success) {
        return NextResponse.json(
          { error: `接続テスト失敗: ${result.error}` },
          { status: 400 }
        );
      }
    }

    const site = addSite({ name, url, username, appPassword });
    return NextResponse.json(site, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
