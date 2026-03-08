import { NextResponse } from 'next/server';
import { loadSiteSettings, saveSiteSettings } from '@/settings-manager.js';

// GET /api/sites/:siteId/settings
export async function GET(request, { params }) {
  try {
    const { siteId } = await params;
    const settings = loadSiteSettings(siteId);
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/sites/:siteId/settings
export async function PUT(request, { params }) {
  try {
    const { siteId } = await params;
    const body = await request.json();
    saveSiteSettings(siteId, body);
    return NextResponse.json({ message: '設定を保存しました' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
