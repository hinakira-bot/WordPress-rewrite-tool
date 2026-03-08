import { subscribe, unsubscribe, getStatus } from '@/lib/pipeline-runner';

// GET: SSE進捗ストリーム
export async function GET(request, { params }) {
  const { siteId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 初期ステータス送信
      const initialStatus = getStatus(siteId);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', data: initialStatus })}\n\n`)
      );

      // SSEリスナー
      const listener = (snapshot, event) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: event.type, data: snapshot })}\n\n`)
          );
        } catch {
          // ストリームが閉じられた場合
          unsubscribe(siteId, listener);
        }
      };

      subscribe(siteId, listener);

      // 30秒ごとにkeep-alive送信
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAlive);
          unsubscribe(siteId, listener);
        }
      }, 30000);

      // クリーンアップ
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        unsubscribe(siteId, listener);
        try {
          controller.close();
        } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
