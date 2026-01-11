# Research & Design Decisions

## Summary
- **Feature**: `household-budget-app`
- **Discovery Scope**: New Feature（グリーンフィールドプロジェクト）
- **Key Findings**:
  - Playwrightは2025年時点で最も信頼性の高いスクレイピングツールであり、Node.js向けに最適化されている
  - Prisma ORMはSQLiteとの相性が抜群で、型安全性と開発効率が非常に高い
  - Gemini API無料枠は2025年12月に削減されたが、1日1回のバッチ処理には十分（5-15 RPM、最大1,000リクエスト/日）
  - Vite PWA Pluginはゼロコンフィグでのサービスワーカー生成とオフライン対応を提供

## Research Log

### Playwright for Web Scraping
- **Context**: 金融機関サイトからの取引データ自動取得に最適なスクレイピングツールの調査
- **Sources Consulted**:
  - [Browserless - Scalable Web Scraping with Playwright](https://www.browserless.io/blog/scraping-with-playwright-a-developer-s-guide-to-scalable-undetectable-data-extraction)
  - [Oxylabs - Playwright Web Scraping Tutorial](https://oxylabs.io/blog/playwright-web-scraping)
  - [BrightData - Web Scraping With Playwright and Node.JS in 2026](https://brightdata.com/blog/how-tos/playwright-web-scraping)
- **Findings**:
  - Node.jsはPlaywrightの第一言語であり、起動時間が短く機能追加も最速
  - Chromiumが速度とスクレイピング予測可能性で最適
  - domcontentloadedイベント待機、重いアセットブロック、特定セレクター待機がパフォーマンス最適化のポイント
  - 二段階認証やCAPTCHA対応はサードパーティソルバー連携が必要
  - 金融機関サイトはIP信頼スコアを重視するため、レジデンシャルプロキシの検討が有効
- **Implications**:
  - スクレイピングは各金融機関ごとに独立したスクレイパーモジュールとして実装
  - エラーハンドリングと部分的失敗の継続処理が必須
  - ブラウザリソース節約のため、ジョブの逐次実行（多重実行防止）を採用

### Prisma ORM with SQLite
- **Context**: 型安全なデータベースアクセスとマイグレーション管理
- **Sources Consulted**:
  - [Prisma - Quickstart with SQLite](https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/sqlite)
  - [TheDataGuy - Node.js ORMs in 2025](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/)
  - [Bytebase - Prisma vs TypeORM](https://www.bytebase.com/blog/prisma-vs-typeorm/)
- **Findings**:
  - Prisma Migrateは使いやすさのゴールドスタンダード
  - スキーマファーストアプローチで、TypeScript型が自動生成される
  - SQLiteとの相性が抜群で、1ファイル=1DBの思想に合致
  - 複雑なジョインで他ORMより約30%高速
  - better-sqlite3アダプターで最適なパフォーマンス
- **Implications**:
  - schema.prismaでデータモデルを一元管理
  - マイグレーションはprisma migrate devで自動生成
  - 型安全なクエリビルダーでランタイムエラーを最小化

### Google Gemini API Free Tier
- **Context**: AI費目分類のための無料LLM API調査
- **Sources Consulted**:
  - [AI Free API - Gemini API Free Tier Limits 2025](https://www.aifreeapi.com/en/posts/gemini-api-free-tier-limit)
  - [Google AI - Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
  - [LaoZhang AI - Gemini API Free Tier 2025](https://blog.laozhang.ai/api-guides/gemini-api-free-tier/)
- **Findings**:
  - 2025年12月に無料枠が50-80%削減された
  - Gemini 2.5 Flash-Lite: 15 RPM、250,000 TPM、1,000リクエスト/日
  - Gemini 2.5 Flash: 10 RPM、250,000 TPM、250リクエスト/日
  - クレジットカード不要で利用可能
  - 429エラー時は指数バックオフ戦略が必要
- **Implications**:
  - 1日1回のバッチ処理（数十〜数百取引）には十分な枠
  - Gemini 2.5 Flash-Liteを第一選択として採用
  - API制限時は「使途不明金」にフォールバック
  - ルールベース分類を優先し、AI呼び出しを最小化

### Vite PWA Plugin
- **Context**: モバイルフレンドリーなPWA対応
- **Sources Consulted**:
  - [Vite PWA Plugin Official Guide](https://vite-pwa-org.netlify.app/guide/)
  - [GitHub - vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)
  - [DEV Community - Turn React Vite into PWA](https://dev.to/bhendi/turn-your-react-vite-app-into-a-pwa-3lpg)
- **Findings**:
  - v0.17からVite 5が必須
  - registerType: 'autoUpdate'で自動更新
  - Web App Manifestとサービスワーカーを自動生成
  - オフラインサポートは静的アセットのキャッシュで実現
  - 本番環境はHTTPS必須
- **Implications**:
  - 最小限の設定でPWA対応可能
  - オフライン時はキャッシュデータを表示
  - 開発環境ではlocalhostでHTTPSなしで動作

### Fastify API Server
- **Context**: 高性能なバックエンドAPIサーバー
- **Sources Consulted**:
  - [Fastify - TypeScript Documentation](https://fastify.dev/docs/latest/Reference/TypeScript/)
  - [Webtrophy - Fastify TypeScript API 2025](https://www.webtrophy.dev/posts/fastify-typescript-api-development-high-performance-server-framework/)
  - [Contentful - Introduction to Fastify](https://www.contentful.com/blog/what-is-fastify/)
- **Findings**:
  - 最大30,000リクエスト/秒の処理能力
  - Expressより優れたネイティブTypeScriptサポート
  - プラグインエコシステムが充実（@fastify/cors, @fastify/jwt等）
  - スキーマベースのバリデーションをサポート
- **Implications**:
  - APIルーティングとバリデーションにFastifyを採用
  - プラグインシステムで機能拡張
  - 個人利用なのでJWT認証は必須ではないが、将来拡張に対応

### AES-256-GCM Encryption
- **Context**: 金融機関認証情報の安全な暗号化
- **Sources Consulted**:
  - [GitHub Gist - Node.js AES-256-GCM Example](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81)
  - [Medium - Guide to Node's crypto module](https://medium.com/@tony.infisical/guide-to-nodes-crypto-module-for-encryption-decryption-65c077176980)
- **Findings**:
  - IV（初期化ベクトル）は96ビット（12バイト）で各暗号化ごとにユニーク
  - 同一キーで2^32メッセージを超えない運用が推奨
  - 認証タグ（authTag）で改ざん検出が可能
  - PBKDF2でマスターキーから派生キー生成（600,000イテレーション推奨）
- **Implications**:
  - Node.js cryptoモジュールのネイティブ実装を使用
  - 各認証情報ごとにユニークIVを生成・保存
  - 環境変数でマスターキーを管理

### TanStack Query
- **Context**: フロントエンドのデータフェッチングとキャッシュ管理
- **Sources Consulted**:
  - [TanStack Query Official](https://tanstack.com/query/latest)
  - [Medium - TanStack Query Mastering Polling](https://medium.com/@soodakriti45/tanstack-query-mastering-polling-ee11dc3625cb)
- **Findings**:
  - refetchIntervalでポーリング実装
  - staleTimeはキャッシュ鮮度、refetchIntervalは定期フェッチ
  - 自動キャッシュ、バックグラウンド更新、ウィンドウフォーカス時の再フェッチ
  - 依存クエリ、並列クエリをサポート
- **Implications**:
  - ジョブステータスのポーリングにrefetchIntervalを使用
  - 取引一覧は適切なstaleTimeでキャッシュ
  - useMutationで取引の作成・更新・削除

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| レイヤードアーキテクチャ | Controller → Service → Repository の3層 | シンプル、理解しやすい | 層間の依存が密結合になりやすい | 個人プロジェクトには過剰な可能性 |
| クリーンアーキテクチャ | ドメイン中心、外側に詳細 | テスタビリティ高い、ドメインロジック保護 | 学習コスト高い、ボイラープレート多い | 規模に対してオーバーエンジニアリング |
| モジュラーモノリス | 機能別モジュールで分割、単一デプロイ | 適度な分離、シンプルなデプロイ | モジュール境界の設計が重要 | **採用**: 個人開発の規模に最適 |

## Design Decisions

### Decision: モジュラーモノリスアーキテクチャの採用
- **Context**: 個人利用の家計簿アプリに最適なアーキテクチャ選定
- **Alternatives Considered**:
  1. マイクロサービス — 運用コストが高すぎる
  2. クリーンアーキテクチャ — ボイラープレートが多い
  3. シンプルなMVC — 機能拡張時にスパゲッティ化しやすい
- **Selected Approach**: 機能別モジュール（scraper, transactions, categories, jobs, analytics）で分割しつつ、単一のFastifyサーバーとしてデプロイ
- **Rationale**: 個人開発で運用コストを最小化しつつ、将来の拡張性を確保
- **Trade-offs**: モジュール境界の設計に注意が必要だが、マイクロサービスほどの複雑さはない
- **Follow-up**: 各モジュールの責務を明確に定義し、循環依存を避ける

### Decision: Gemini 2.5 Flash-Liteを費目分類AIに採用
- **Context**: 無料で利用可能なLLM APIの選定
- **Alternatives Considered**:
  1. Gemini 2.5 Pro — 高性能だが5 RPM/100リクエスト日の制限
  2. ローカルLLM（Ollama） — サーバースペック要件が高い
  3. ルールベースのみ — 新規摘要への対応が困難
- **Selected Approach**: Gemini 2.5 Flash-Lite（15 RPM、1,000リクエスト/日）をAI推論に使用し、ルールベース分類を優先
- **Rationale**: 高速レスポンス、十分な無料枠、クレジットカード不要
- **Trade-offs**: 2025年12月の枠削減により余裕が減少したが、1日1回のバッチ処理には十分
- **Follow-up**: API制限に達した場合のフォールバック処理を実装

### Decision: 非同期ジョブキューの内部実装
- **Context**: スクレイピングジョブの非同期実行管理
- **Alternatives Considered**:
  1. Redis + BullMQ — 外部依存、運用コスト増
  2. SQLiteベースのジョブテーブル + ポーリング — シンプル、追加依存なし
  3. node-cron直接実行 — ジョブ状態管理が困難
- **Selected Approach**: SQLiteのjobsテーブルでジョブ管理、バックグラウンドワーカーがポーリングで実行
- **Rationale**: 外部依存なし、SQLite単一ファイルで完結、障害復旧が容易
- **Trade-offs**: 高スループットには不向きだが、1日1回の実行には十分
- **Follow-up**: ジョブの多重実行防止ロックを実装

## Risks & Mitigations
- **金融機関サイト仕様変更** — 各スクレイパーをモジュール化し、独立してメンテナンス可能に。エラー時は他機関の処理を継続。
- **Gemini API枠のさらなる削減** — ルールベース分類を優先し、AI呼び出しを最小化。ローカルLLMへの移行パスを検討。
- **認証情報漏洩** — AES-256-GCM暗号化、マスターキーの環境変数管理、復号はスクレイピング実行時のみ。
- **SQLiteの同時アクセス制限** — 書き込みは逐次実行、読み取りは並行可能。個人利用では問題にならない。

## References
- [Playwright Official Documentation](https://playwright.dev/docs/intro) — ブラウザ自動操作の公式ドキュメント
- [Prisma Documentation](https://www.prisma.io/docs) — ORM設定とマイグレーション
- [Google Gemini API](https://ai.google.dev/gemini-api/docs) — AI API仕様と料金
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/) — PWA設定ガイド
- [Fastify Documentation](https://fastify.dev/docs/latest/) — APIサーバーフレームワーク
- [TanStack Query](https://tanstack.com/query/latest) — データフェッチングライブラリ
