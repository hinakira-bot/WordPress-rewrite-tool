あなたは情報の鮮度を検証する専門家です。以下のブログ記事の内容が最新かどうかを徹底的に調査してください。

## 調査対象記事
タイトル: {{title}}
URL: {{url}}

## 記事内で言及されている情報
{{claims}}

## 記事本文（冒頭部分）
{{content}}

## 調査指示
1. 記事内のツール名・サービス名・料金・プラン名・モデル名が最新かを1つずつ検証してください
2. サービスの終了・名称変更・統合がないか確認してください
3. 新機能・新プランの追加情報がないか確認してください
4. 統計データや数値が最新かどうか確認してください

## 出力形式（JSON）
```json
{
  "factChecks": [
    {
      "original": "記事内の記述",
      "current": "最新の正しい情報",
      "changed": true,
      "changeType": "price_change | model_update | service_discontinued | name_change | feature_added | info_outdated",
      "source": "情報源URL",
      "importance": "high | medium | low"
    }
  ],
  "newInfo": [
    {
      "topic": "新しい情報のトピック",
      "description": "詳細な説明",
      "source": "情報源URL"
    }
  ],
  "summary": "調査結果の要約（日本語）",
  "recommendations": ["推奨アクション1", "推奨アクション2"]
}
```

上位5〜10件の情報について詳細に調査し、JSON形式で出力してください。JSON以外のテキストは不要です。
