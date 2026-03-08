import { NextResponse } from 'next/server';
import { loadSites } from '@/site-manager.js';

// GET /api/stats - 全体統計
export async function GET() {
  try {
    const sites = loadSites();

    const stats = {
      totalSites: sites.length,
      activeSites: sites.filter((s) => s.status === 'active').length,
      totalArticles: sites.reduce((sum, s) => sum + (s.articleCount || 0), 0),
      totalRewritten: sites.reduce((sum, s) => sum + (s.rewrittenCount || 0), 0),
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
