/**
 * カスタムサーバー: Next.js Web UI + マルチサイト自動リライトスケジューラー
 *
 * Next.js 16 の instrumentation.js 内の setInterval / node-cron は
 * production cluster モードで持続しないため、
 * カスタムサーバーでスケジューラーを同一プロセス内で動かす。
 */
import { createServer } from 'http';
import next from 'next';

const port = parseInt(process.env.PORT || '3002', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, port });
const handle = app.getRequestHandler();

// === Basic認証（VPS公開時） ===
const WEB_USER = process.env.WEB_USER || '';
const WEB_PASS = process.env.WEB_PASSWORD || '';
const authEnabled = !!(WEB_USER && WEB_PASS);

function checkBasicAuth(req, res) {
  if (!authEnabled) return true;

  // API内部呼び出しはスキップ（SSEなど）
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="WordPress Auto Rewriter"',
      'Content-Type': 'text/plain',
    });
    res.end('認証が必要です');
    return false;
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [user, pass] = credentials.split(':');

  if (user === WEB_USER && pass === WEB_PASS) return true;

  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('認証に失敗しました');
  return false;
}

// === サイト別スケジューラー ===
const lastRunKeys = new Map(); // siteId → lastRunKey

async function checkAllSiteSchedules() {
  try {
    const { loadSites } = await import('./src/site-manager.js');
    const { loadSiteSettings } = await import('./src/settings-manager.js');
    const { autoRewrite, getStatus } = await import('./src/lib/pipeline-runner.js');

    const sites = loadSites();

    for (const site of sites) {
      if (site.status !== 'active') continue;

      const settings = loadSiteSettings(site.id);
      const cronExpr = settings.rewrite?.cronSchedule || '0 10 * * *';

      const now = new Date();
      const minute = now.getMinutes();
      const hour = now.getHours();
      const dow = now.getDay();
      const runKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hour}-${minute}`;

      const lastKey = lastRunKeys.get(site.id) || '';
      if (runKey === lastKey) continue;

      const schedules = cronExpr.split(';').map(s => s.trim()).filter(Boolean);
      const matched = schedules.some(s => shouldRun(s, minute, hour, dow));
      if (!matched) continue;

      const status = getStatus(site.id);
      if (status.running) {
        console.log(`[scheduler] ${site.name}: パイプライン実行中のためスキップ`);
        continue;
      }

      lastRunKeys.set(site.id, runKey);
      console.log(`[scheduler] ${site.name}: 自動リライト開始 (${hour}:${String(minute).padStart(2, '0')})`);

      try {
        // まずキューがあればキュー処理、なければ自動選定
        const { loadQueue } = await import('./src/queue-manager.js');
        const queue = loadQueue(site.id);
        const pendingCount = queue.filter(q => q.status === 'pending').length;

        if (pendingCount > 0) {
          const { processQueue } = await import('./src/lib/pipeline-runner.js');
          await processQueue(site.id, { triggeredBy: 'auto' });
          console.log(`[scheduler] ${site.name}: キュー処理完了`);
        } else {
          await autoRewrite(site.id);
          console.log(`[scheduler] ${site.name}: 自動リライト完了`);
        }
      } catch (err) {
        console.error(`[scheduler] ${site.name}: エラー - ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[scheduler] チェックエラー: ${err.message}`);
  }
}

function shouldRun(cronExpr, minute, hour, dow) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [cronMin, cronHour, , , cronDow] = parts;
  return matchField(cronMin, minute) && matchField(cronHour, hour) && matchField(cronDow, dow);
}

function matchField(field, value) {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      if (value >= s && value <= e) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }
  return false;
}

function describeCron(cronExpr) {
  const schedules = cronExpr.split(';').map(s => s.trim()).filter(Boolean);
  return schedules.map(s => {
    const parts = s.split(/\s+/);
    if (parts.length !== 5) return s;
    const [m, h, , , d] = parts;
    const times = h.split(',').map(hh => `${hh}:${m.padStart(2, '0')}`).join(' と ');
    const dayStr = d === '*' ? '毎日' : d === '1-5' ? '平日' : `曜日${d}`;
    return `${dayStr} ${times}`;
  }).join(' / ');
}

// === サーバー起動 ===
app.prepare().then(() => {
  createServer((req, res) => {
    if (!checkBasicAuth(req, res)) return;
    handle(req, res);
  }).listen(port, '0.0.0.0', async () => {
    console.log('');
    console.log('▲ WordPress Auto Rewriter');
    console.log(`  http://localhost:${port}`);
    console.log(`  認証: ${authEnabled ? '🔒 有効' : '🔓 無効（.env で WEB_USER/WEB_PASSWORD を設定）'}`);
    console.log('');

    // 登録サイトのスケジュール情報を表示
    try {
      const { loadSites } = await import('./src/site-manager.js');
      const { loadSiteSettings } = await import('./src/settings-manager.js');
      const sites = loadSites();

      if (sites.length > 0) {
        console.log('[scheduler] 登録サイト:');
        for (const site of sites) {
          if (site.status !== 'active') continue;
          const settings = loadSiteSettings(site.id);
          const schedule = settings.rewrite?.cronSchedule || '0 10 * * *';
          console.log(`  - ${site.name}: ${schedule} (${describeCron(schedule)})`);
        }
      } else {
        console.log('[scheduler] 登録サイトなし - ダッシュボードからサイトを追加してください');
      }
    } catch {
      // 初回起動時はサイトなし
    }

    // 60秒ごとにスケジュールチェック
    setInterval(checkAllSiteSchedules, 60 * 1000);
    console.log('[scheduler] マルチサイトスケジューラー起動 (60秒間隔)');
    console.log('');
  });
});
