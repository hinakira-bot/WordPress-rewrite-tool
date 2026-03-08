import logger from './logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Helper: sleep
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Helper: エラー翻訳
// ---------------------------------------------------------------------------

function translateApiError(status, body) {
  if (status === 401) return '認証失敗: ユーザー名またはアプリケーションパスワードを確認してください';
  if (status === 403) return '権限不足: 投稿権限のあるユーザーか確認してください';
  if (status === 404) return 'REST APIエンドポイントが見つかりません。パーマリンク設定を「投稿名」に変更してください';
  if (body && typeof body === 'object' && body.code === 'rest_no_route') {
    return 'REST APIが無効です。セキュリティプラグインの設定を確認してください';
  }
  return null;
}

function translateNetworkError(err) {
  const codes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
  if (codes.includes(err.code) || codes.includes(err.cause?.code)) {
    return '接続できません。サイトURLとSSL設定を確認してください';
  }
  return null;
}

// ---------------------------------------------------------------------------
// WordPressClient クラス
// ---------------------------------------------------------------------------

export class WordPressClient {
  constructor(siteUrl, username, appPassword) {
    this.siteUrl = siteUrl.replace(/\/+$/, '');
    this.username = username;
    this.appPassword = appPassword;
    this.apiBase = `${this.siteUrl}/wp-json/wp/v2`;
  }

  // --- 認証ヘッダー ---
  getAuthHeader() {
    if (!this.username || !this.appPassword) {
      throw new Error('WordPress認証情報が未設定です');
    }
    const credentials = Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
    return `Basic ${credentials}`;
  }

  // --- 汎用fetch ---
  async wpFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.apiBase}${endpoint}`;
    const headers = {
      Authorization: this.getAuthHeader(),
      ...options.headers,
    };

    try {
      return await fetch(url, { ...options, headers });
    } catch (err) {
      const networkMsg = translateNetworkError(err);
      if (networkMsg) throw new Error(networkMsg);
      throw err;
    }
  }

  // --- JSON fetch ---
  async wpFetchJSON(endpoint, options = {}) {
    const response = await this.wpFetch(endpoint, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });

    let body;
    try { body = await response.json(); } catch { body = null; }

    if (!response.ok) {
      const translated = translateApiError(response.status, body);
      if (translated) throw new Error(translated);
      const detail = body?.message || body?.code || response.statusText;
      throw new Error(`WordPress API エラー (${response.status}): ${detail}`);
    }

    return { data: body, headers: response.headers };
  }

  // --- 接続テスト ---
  async testConnection() {
    logger.info(`WordPress接続テスト: ${this.siteUrl}`);

    try {
      const { data: user } = await this.wpFetchJSON('/users/me?context=edit');

      let siteName = '';
      try {
        const siteResponse = await fetch(`${this.siteUrl}/wp-json`);
        if (siteResponse.ok) {
          const siteInfo = await siteResponse.json();
          siteName = siteInfo.name || '';
        }
      } catch { siteName = ''; }

      const userName = user.name || user.slug || '';
      logger.info(`WordPress接続成功 - サイト: ${siteName}, ユーザー: ${userName}`);

      return { success: true, siteName, userName };
    } catch (err) {
      logger.error(`WordPress接続テスト失敗: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // --- 記事一覧取得（ページネーション対応） ---
  async fetchAllPosts(onProgress) {
    let page = 1;
    const perPage = 100;
    const allPosts = [];

    while (true) {
      const endpoint = `/posts?page=${page}&per_page=${perPage}&status=publish&_fields=id,title,date,modified,content,excerpt,categories,tags,slug,link`;
      onProgress?.({ message: `記事を取得中... (ページ ${page})` });

      try {
        const { data: posts, headers } = await this.wpFetchJSON(endpoint);
        const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10);
        const totalPosts = parseInt(headers.get('x-wp-total') || '0', 10);

        allPosts.push(...posts);
        onProgress?.({ message: `記事を取得中... (${allPosts.length}/${totalPosts})` });

        if (page >= totalPages || posts.length < perPage) break;
        page++;
        await sleep(500); // レートリミット対策
      } catch (err) {
        // 最終ページ超過 (400エラー)
        if (err.message.includes('400')) break;
        throw err;
      }
    }

    logger.info(`記事取得完了: ${allPosts.length}件`);
    return allPosts;
  }

  // --- 単一記事取得 ---
  async getPost(postId) {
    const { data } = await this.wpFetchJSON(`/posts/${postId}?context=edit`);
    return data;
  }

  // --- 記事更新 ---
  async updatePost(postId, postData) {
    logger.info(`記事更新: ID=${postId}, タイトル="${postData.title || ''}"`);

    const { data } = await this.wpFetchJSON(`/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(postData),
    });

    logger.info(`記事更新成功: ID=${data.id}, URL=${data.link}`);
    return data;
  }

  // --- 全記事のURL一覧取得（内部リンクチェック用） ---
  async fetchPostIndex() {
    let page = 1;
    const perPage = 100;
    const index = [];

    while (true) {
      try {
        const { data: posts, headers } = await this.wpFetchJSON(
          `/posts?page=${page}&per_page=${perPage}&status=publish&_fields=id,title,slug,link,categories`
        );
        const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10);

        for (const p of posts) {
          index.push({
            id: p.id,
            title: p.title?.rendered || '',
            slug: p.slug,
            url: p.link,
            categories: p.categories || [],
          });
        }

        if (page >= totalPages || posts.length < perPage) break;
        page++;
        await sleep(300);
      } catch {
        break;
      }
    }

    return index;
  }

  // --- URLの生存確認 ---
  async checkUrlAlive(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      return {
        alive: response.ok,
        status: response.status,
        redirected: response.redirected,
        finalUrl: response.url,
      };
    } catch {
      return { alive: false, status: 0, redirected: false, finalUrl: url };
    }
  }
}
