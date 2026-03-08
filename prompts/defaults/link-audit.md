以下のブログ記事内のリンクを分析し、改善提案を行ってください。

## 記事タイトル
{{title}}

## 記事内のリンク一覧
### 内部リンク
{{internalLinks}}

### 外部リンク
{{externalLinks}}

## 分析指示
1. 各リンクの妥当性（アンカーテキストとリンク先の関連性）
2. 追加すべき内部リンクの提案
3. 追加すべき外部リンクの提案
4. 削除・差し替えすべきリンクの特定

## 出力形式（JSON）
```json
{
  "linkAnalysis": [
    {
      "url": "リンクURL",
      "type": "internal | external",
      "relevance": "high | medium | low",
      "recommendation": "keep | replace | remove",
      "reason": "理由"
    }
  ],
  "suggestedAdditions": [
    {
      "type": "internal | external",
      "anchorText": "アンカーテキスト",
      "url": "リンクURL",
      "insertSection": "挿入すべきセクション"
    }
  ]
}
```
