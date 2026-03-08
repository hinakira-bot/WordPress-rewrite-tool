import { NextResponse } from 'next/server';
import { getSite, updateSite, deleteSite } from '@/site-manager.js';
import { WordPressClient } from '@/wordpress-client.js';

// GET /api/sites/:siteId
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const site = getSite(siteId);
    if (!site) {
      return NextResponse.json({ error: 'サイトが見つかりません' }, { status: 404 });
    }
    return NextResponse.json({
      ...site,
      appPassword: site.appPassword ? site.appPassword.slice(0, 4) + ' ****' : '',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/sites/:siteId
export async function PUT(request, { params }) {
  try {
    const { siteId } = await params;
    const body = await request.json();

    // 接続テストが要求された場合
    if (body.testConnection) {
      const site = getSite(siteId);
      if (!site) {
        return NextResponse.json({ error: 'サイトが見つかりません' }, { status: 404 });
      }
      const client = new WordPressClient(
        body.url || site.url,
        body.username || site.username,
        body.appPassword || site.appPassword
      );
      const result = await client.testConnection();
      if (!result.success) {
        return NextResponse.json({ error: `接続テスト失敗: ${result.error}` }, { status: 400 });
      }
    }

    const updated = updateSite(siteId, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

// DELETE /api/sites/:siteId
export async function DELETE(request, { params }) {
  try {
    const { siteId } = await params;
    const removed = deleteSite(siteId);
    return NextResponse.json({ message: `${removed.name} を削除しました` });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
