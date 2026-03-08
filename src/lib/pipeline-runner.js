/**
 * マルチサイト対応パイプラインランナー
 * Web UIからのリライト実行を管理し、SSEクライアントに進捗をブロードキャスト
 */

// グローバルシングルトン（Next.js HMRでも維持）
const globalKey = Symbol.for('rewrite-pipeline-runner');
if (!global[globalKey]) {
  global[globalKey] = new Map(); // siteId → state
}

const siteStates = global[globalKey];

// ---------------------------------------------------------------------------
// サイト別ステート初期化
// ---------------------------------------------------------------------------

function getState(siteId) {
  if (!siteStates.has(siteId)) {
    siteStates.set(siteId, {
      running: false,
      step: 'idle',
      currentArticle: '',
      progress: 0,
      total: 0,
      processed: 0,
      startedAt: null,
      logs: [],
      result: null,
      subscribers: new Set(),
    });
  }
  return siteStates.get(siteId);
}

// ---------------------------------------------------------------------------
// ブロードキャスト
// ---------------------------------------------------------------------------

function broadcast(siteId, eventData) {
  const state = getState(siteId);
  const snapshot = getStatus(siteId);
  for (const cb of state.subscribers) {
    try {
      cb(snapshot, eventData);
    } catch { /* ignore subscriber errors */ }
  }
}

function addLog(siteId, level, message) {
  const state = getState(siteId);
  const entry = {
    time: new Date().toLocaleTimeString('ja-JP'),
    level,
    message,
  };
  state.logs.push(entry);
  if (state.logs.length > 200) {
    state.logs = state.logs.slice(-100);
  }
  broadcast(siteId, { type: 'log', data: entry });
}

// ---------------------------------------------------------------------------
// パイプライン実行（単一記事）
// ---------------------------------------------------------------------------

export async function startSingleRewrite(siteId, articleWpId, options = {}) {
  const state = getState(siteId);

  if (state.running) {
    const elapsed = state.startedAt
      ? (Date.now() - new Date(state.startedAt).getTime()) / 1000
      : 0;
    if (elapsed > 1800) {
      state.running = false;
      addLog(siteId, 'warn', 'タイムアウト - 強制リセット');
    } else {
      throw new Error('このサイトのパイプラインは既に実行中です');
    }
  }

  // 状態リセット
  state.running = true;
  state.step = 'rewrite';
  state.currentArticle = `記事#${articleWpId}`;
  state.progress = 0;
  state.total = 1;
  state.processed = 0;
  state.startedAt = new Date().toISOString();
  state.logs = [];
  state.result = null;

  addLog(siteId, 'info', `リライト開始: 記事#${articleWpId}`);
  broadcast(siteId, { type: 'started' });

  // 非同期で実行
  (async () => {
    try {
      const { runRewritePipeline } = await import('../rewrite-pipeline.js');
      const { addHistoryEntry } = await import('../checkpoint-manager.js');

      const result = await runRewritePipeline(siteId, articleWpId, {
        ...options,
        onProgress: ({ step, total, message, done }) => {
          if (step > 0 && total > 0) state.progress = Math.round((step / total) * 100);
          if (message) {
            state.currentArticle = message;
            addLog(siteId, 'info', message);
          }
          broadcast(siteId, { type: 'progress' });
        },
      });

      state.step = result.success ? 'done' : 'error';
      state.progress = result.success ? 100 : state.progress;
      state.processed = 1;
      state.result = result;

      // 履歴に記録
      addHistoryEntry(siteId, {
        articleWpId,
        title: result.title || `記事#${articleWpId}`,
        score: result.score,
        updateMethod: result.updateMethod,
        elapsed: result.elapsed,
        changes: result.diff?.stats || {},
        freshnessIssues: result.freshnessReport?.factChecks?.filter((f) => f.changed)?.length || 0,
        linksFixed: 0,
        faqAdded: !!result.diff?.summary?.faqAdded,
        success: result.success,
        error: result.error,
        triggeredBy: options.triggeredBy || 'manual',
      });

      addLog(siteId, result.success ? 'info' : 'error',
        result.success
          ? `完了: ${result.title} (${result.elapsed}秒)`
          : `エラー: ${result.error || '不明'}`
      );
      broadcast(siteId, { type: 'done' });
    } catch (err) {
      state.step = 'error';
      state.result = { success: false, error: err.message };
      addLog(siteId, 'error', `致命的エラー: ${err.message}`);
      broadcast(siteId, { type: 'done' });
    } finally {
      state.running = false;
    }
  })();
}

// ---------------------------------------------------------------------------
// パイプライン実行（キュー処理）
// ---------------------------------------------------------------------------

export async function processQueue(siteId, options = {}) {
  const state = getState(siteId);

  if (state.running) {
    throw new Error('このサイトのパイプラインは既に実行中です');
  }

  const { loadQueue, updateQueueItem, getNextInQueue } = await import('../queue-manager.js');
  const { loadSiteSettings } = await import('../settings-manager.js');

  const settings = loadSiteSettings(siteId);
  const maxArticles = options.maxArticles || settings.rewrite?.articlesPerDay || 3;

  const queue = loadQueue(siteId);
  const pendingCount = queue.filter((q) => q.status === 'pending').length;

  if (pendingCount === 0) {
    addLog(siteId, 'info', 'キューに処理対象がありません');
    return { processed: 0, skipped: 0 };
  }

  // 状態初期化
  state.running = true;
  state.step = 'queue';
  state.progress = 0;
  state.total = Math.min(pendingCount, maxArticles);
  state.processed = 0;
  state.startedAt = new Date().toISOString();
  state.logs = [];
  state.result = null;

  addLog(siteId, 'info', `キュー処理開始: ${state.total}件`);
  broadcast(siteId, { type: 'started' });

  // 非同期で実行
  (async () => {
    try {
      const { runRewritePipeline } = await import('../rewrite-pipeline.js');
      const { addHistoryEntry } = await import('../checkpoint-manager.js');
      let processedCount = 0;

      for (let i = 0; i < maxArticles; i++) {
        const item = getNextInQueue(siteId);
        if (!item) break;

        // キューアイテムを処理中に更新
        updateQueueItem(siteId, item.id, {
          status: 'processing',
          startedAt: new Date().toISOString(),
        });

        state.currentArticle = item.title;
        addLog(siteId, 'info', `[${i + 1}/${state.total}] ${item.title} 処理中...`);
        broadcast(siteId, { type: 'progress' });

        try {
          const result = await runRewritePipeline(siteId, item.articleWpId, {
            ...options,
            onProgress: ({ step, total, message }) => {
              if (step > 0 && total > 0) {
                const articleProgress = Math.round((step / total) * 100);
                state.progress = Math.round(((i + articleProgress / 100) / state.total) * 100);
              }
              if (message) addLog(siteId, 'info', `  ${message}`);
              broadcast(siteId, { type: 'progress' });
            },
          });

          updateQueueItem(siteId, item.id, {
            status: result.success ? 'completed' : 'failed',
            completedAt: new Date().toISOString(),
            error: result.error || null,
            result: { elapsed: result.elapsed, updateMethod: result.updateMethod },
          });

          // 履歴に記録
          addHistoryEntry(siteId, {
            articleWpId: item.articleWpId,
            title: result.title || item.title,
            updateMethod: result.updateMethod,
            elapsed: result.elapsed,
            changes: result.diff?.stats || {},
            freshnessIssues: result.freshnessReport?.factChecks?.filter((f) => f.changed)?.length || 0,
            faqAdded: !!result.diff?.summary?.faqAdded,
            success: result.success,
            error: result.error,
            triggeredBy: options.triggeredBy || 'queue',
          });

          processedCount++;
        } catch (err) {
          updateQueueItem(siteId, item.id, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: err.message,
          });
          addLog(siteId, 'error', `  失敗: ${err.message}`);
        }

        state.processed = i + 1;
        state.progress = Math.round(((i + 1) / state.total) * 100);
        broadcast(siteId, { type: 'progress' });

        // API制限回避のため少し待機
        if (i < maxArticles - 1) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }

      state.step = 'done';
      state.progress = 100;
      state.result = { success: true, processed: processedCount };
      addLog(siteId, 'info', `キュー処理完了: ${processedCount}件処理`);
      broadcast(siteId, { type: 'done' });
    } catch (err) {
      state.step = 'error';
      state.result = { success: false, error: err.message };
      addLog(siteId, 'error', `キュー処理エラー: ${err.message}`);
      broadcast(siteId, { type: 'done' });
    } finally {
      state.running = false;
    }
  })();
}

// ---------------------------------------------------------------------------
// 自動リライト（スコアベース）
// ---------------------------------------------------------------------------

export async function autoRewrite(siteId, options = {}) {
  const state = getState(siteId);

  if (state.running) {
    throw new Error('このサイトのパイプラインは既に実行中です');
  }

  const { loadArticles } = await import('../article-fetcher.js');
  const { scoreArticle } = await import('../article-scorer.js');
  const { loadSiteSettings } = await import('../settings-manager.js');

  const settings = loadSiteSettings(siteId);
  const maxArticles = settings.rewrite?.articlesPerDay || 3;
  const minScore = settings.scoring?.minScoreForAutoRewrite || 50;

  const { articles } = loadArticles(siteId);

  // スコアリング & 対象選定
  const candidates = articles
    .map((a) => ({ ...a, score: scoreArticle(a).total }))
    .filter((a) => a.score >= minScore && a.rewriteStatus !== 'rewritten' && a.rewriteStatus !== 'processing')
    .sort((a, b) => b.score - a.score)
    .slice(0, maxArticles);

  if (candidates.length === 0) {
    addLog(siteId, 'info', '自動リライト: 対象記事なし');
    return { processed: 0 };
  }

  // 状態初期化
  state.running = true;
  state.step = 'auto';
  state.progress = 0;
  state.total = candidates.length;
  state.processed = 0;
  state.startedAt = new Date().toISOString();
  state.logs = [];
  state.result = null;

  addLog(siteId, 'info', `自動リライト開始: ${candidates.length}件（最低スコア: ${minScore}）`);
  broadcast(siteId, { type: 'started' });

  // 非同期で実行
  (async () => {
    try {
      const { runRewritePipeline } = await import('../rewrite-pipeline.js');
      const { addHistoryEntry } = await import('../checkpoint-manager.js');
      let processedCount = 0;

      for (let i = 0; i < candidates.length; i++) {
        const article = candidates[i];
        state.currentArticle = article.title;
        addLog(siteId, 'info', `[${i + 1}/${candidates.length}] ${article.title} (スコア: ${article.score})`);
        broadcast(siteId, { type: 'progress' });

        try {
          const result = await runRewritePipeline(siteId, article.wpId, {
            onProgress: ({ step, total, message }) => {
              if (step > 0 && total > 0) {
                const articleProgress = Math.round((step / total) * 100);
                state.progress = Math.round(((i + articleProgress / 100) / candidates.length) * 100);
              }
              if (message) addLog(siteId, 'info', `  ${message}`);
              broadcast(siteId, { type: 'progress' });
            },
          });

          addHistoryEntry(siteId, {
            articleWpId: article.wpId,
            title: result.title || article.title,
            score: article.score,
            updateMethod: result.updateMethod,
            elapsed: result.elapsed,
            changes: result.diff?.stats || {},
            freshnessIssues: result.freshnessReport?.factChecks?.filter((f) => f.changed)?.length || 0,
            faqAdded: !!result.diff?.summary?.faqAdded,
            success: result.success,
            error: result.error,
            triggeredBy: 'auto',
          });

          if (result.success) processedCount++;
        } catch (err) {
          addLog(siteId, 'error', `  失敗: ${err.message}`);
        }

        state.processed = i + 1;
        state.progress = Math.round(((i + 1) / candidates.length) * 100);
        broadcast(siteId, { type: 'progress' });

        // API制限回避のため待機
        if (i < candidates.length - 1) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }

      state.step = 'done';
      state.progress = 100;
      state.result = { success: true, processed: processedCount, total: candidates.length };
      addLog(siteId, 'info', `自動リライト完了: ${processedCount}/${candidates.length}件`);
      broadcast(siteId, { type: 'done' });
    } catch (err) {
      state.step = 'error';
      state.result = { success: false, error: err.message };
      addLog(siteId, 'error', `自動リライトエラー: ${err.message}`);
      broadcast(siteId, { type: 'done' });
    } finally {
      state.running = false;
    }
  })();
}

// ---------------------------------------------------------------------------
// ステータス取得
// ---------------------------------------------------------------------------

export function getStatus(siteId) {
  const state = getState(siteId);
  return {
    running: state.running,
    step: state.step,
    currentArticle: state.currentArticle,
    progress: state.progress,
    total: state.total,
    processed: state.processed,
    startedAt: state.startedAt,
    logs: [...state.logs],
    result: state.result,
  };
}

// ---------------------------------------------------------------------------
// 強制リセット
// ---------------------------------------------------------------------------

export function resetPipeline(siteId) {
  const state = getState(siteId);
  const wasRunning = state.running;
  state.running = false;
  state.step = 'idle';
  state.progress = 0;
  state.total = 0;
  state.processed = 0;
  state.result = null;
  state.currentArticle = '';
  state.startedAt = null;
  state.logs = [];
  broadcast(siteId, { type: 'reset' });
  return { reset: true, wasRunning };
}

// ---------------------------------------------------------------------------
// SSEリスナー登録・解除
// ---------------------------------------------------------------------------

export function subscribe(siteId, callback) {
  const state = getState(siteId);
  state.subscribers.add(callback);
}

export function unsubscribe(siteId, callback) {
  const state = getState(siteId);
  state.subscribers.delete(callback);
}
