# Research & Design Decisions

## Summary
- **Feature**: `otp-financial-scraping`
- **Discovery Scope**: Extension（既存スクレイピングシステムへのOTP/2FA対応拡張）
- **Key Findings**:
  - 既存の`BaseScraper`クラスとジョブシステムを拡張してOTP対応を実現可能
  - vite-plugin-pwaの`injectManifest`戦略でカスタムService Workerを実装する必要がある
  - `web-push`ライブラリはVAPID認証をサポートし、Node.js環境で安定動作

---

## Research Log

### Web Push通知とVAPID認証

- **Context**: ユーザーがブラウザを閉じている状態でもOTP入力要求を通知するため、Web Push APIを使用する必要がある
- **Sources Consulted**:
  - [web-push npm](https://www.npmjs.com/package/web-push)
  - [GitHub - web-push-libs/web-push](https://github.com/web-push-libs/web-push)
  - [Web Push Protocol - web.dev](https://web.dev/articles/push-notifications-web-push-protocol)
- **Findings**:
  - `web-push`ライブラリは業界標準のNode.js用Web Pushライブラリ
  - VAPID鍵は`npx web-push generate-vapid-keys`で生成可能
  - `setVapidDetails(subject, publicKey, privateKey)`でVAPID認証を設定
  - Safari localhostでVAPID subjectがhttps://localhostの場合にBadJwtTokenエラーが発生する既知の問題あり
  - TTLのデフォルトは4週間、タイムアウトはミリ秒で設定可能
- **Implications**:
  - 本番環境ではカスタムドメイン（Cloudflare Tunnel経由）を使用するため、Safari問題は回避可能
  - VAPID鍵は環境変数で管理し、`mailto:`形式のsubjectを設定

### vite-plugin-pwa injectManifest戦略

- **Context**: Push通知の受信とnotificationclickイベント処理にはカスタムService Workerが必要
- **Sources Consulted**:
  - [Advanced (injectManifest) | Vite PWA](https://vite-pwa-org.netlify.app/guide/inject-manifest)
  - [injectManifest | Workbox | Vite PWA](https://vite-pwa-org.netlify.app/workbox/inject-manifest)
  - [GitHub Issue #132 - Push Notifications](https://github.com/vite-pwa/docs/issues/132)
- **Findings**:
  - 現在の設定は`registerType: 'autoUpdate'`でWorkbox自動生成モード
  - Push通知を処理するには`strategies: 'injectManifest'`に変更が必要
  - `srcDir`と`filename`でカスタムSWのソースを指定
  - 開発モードでの動作には`devOptions.enabled: true`が必要
  - TypeScriptで記述可能（`.ts`ファイル）
- **Implications**:
  - `vite.config.ts`の設定変更が必要
  - 新規ファイル`frontend/src/sw.ts`でカスタムService Workerを実装
  - 既存のWorkboxキャッシング設定は移行が必要

### TOTPライブラリ選定

- **Context**: TOTPシークレット事前登録機能でOTPを自動生成するためのライブラリが必要
- **Sources Consulted**:
  - [otplib - npm](https://www.npmjs.com/package/otplib)
  - [otpauth - npm](https://www.npmjs.com/package/otpauth)
  - [GitHub - yeojz/otplib](https://github.com/yeojz/otplib)
  - [GitHub - hectorm/otpauth](https://github.com/hectorm/otpauth)
- **Findings**:
  - **otplib**: TypeScript-first、RFC 6238準拠、セキュリティ監査済み、v13.1.1（2日前更新）
  - **otpauth**: RFC 6238準拠、SHA1/256/512対応、デモアプリあり
  - 両ライブラリとも`otpauth://`URI形式をサポート
  - 元の要件で言及された`speakeasy`は古く、`otplib`が後継として推奨
- **Implications**:
  - `otplib`を採用（TypeScript-first、最新アップデート、監査済み）
  - シークレットキーは既存の暗号化方式（AES-256-GCM）と統一

### 既存コードベース分析

- **Context**: 既存のスクレイパーアーキテクチャとの統合方法を検討
- **Sources Consulted**: ローカルコードベース分析
- **Findings**:
  - **BaseScraper**: `scrape()`メソッドは同期的に完了まで実行、try-finally構造
  - **ScraperService**: 認証情報取得→スクレイピング実行→結果処理の流れ
  - **JobService**: `pending | running | completed | failed`のステータス管理
  - **ScrapeErrorType**: `TWO_FACTOR_REQUIRED`は定義済みだが未使用
  - **Prisma Schema**: Jobモデルにステータスとエラーメッセージのみ、OTP関連フィールドなし
  - **vite.config.ts**: PWA設定は`workbox`戦略（自動生成）
- **Implications**:
  - `JobStatus`に`waiting_for_otp`を追加
  - `BaseScraper`にOTP検知・待機・入力メソッドを追加
  - Jobモデルに`otpAuthMethod`と`otpRequestedAt`を追加
  - Accountモデルに`totpSecret`（暗号化）と`pushSubscription`（JSON）を追加

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Polling (TanStack Query) | クライアントが定期的にOTP要求状態を確認 | シンプル、既存技術で実装可能 | リアルタイム性が低い、バッテリー消費 | 却下 |
| WebSocket | 双方向通信でリアルタイム通知 | リアルタイム性高い | 実装複雑、状態管理が必要 | 却下 |
| Server-Sent Events (SSE) | サーバーからの一方向Push | シンプル、HTTPベース | ブラウザが閉じていると受信不可 | 却下 |
| **Web Push API** | Service Worker経由のPush通知 | ブラウザ閉じても通知可能、PWA基盤と統合 | injectManifest移行が必要 | **採用** |

---

## Design Decisions

### Decision: Web Push APIによる通知方式

- **Context**: OTP入力要求をユーザーにリアルタイムで通知する必要がある
- **Alternatives Considered**:
  1. Polling - TanStack Queryで定期確認
  2. WebSocket - 双方向通信
  3. SSE - サーバープッシュ
  4. Web Push API - Service Worker経由
- **Selected Approach**: Web Push API + Service Worker
- **Rationale**:
  - ブラウザを閉じていても通知を受信可能（要件2.4）
  - 既存PWA基盤（vite-plugin-pwa）を活用可能
  - Cloudflare Tunnel環境でHTTPSが自動化されており、Web Push APIが動作可能
- **Trade-offs**:
  - vite.config.tsの設定変更とカスタムSW実装が必要
  - 開発環境ではCloudflare Tunnel経由またはPollingフォールバックが必要
- **Follow-up**: Safari/iOS対応状況の確認（iOS 16.4以降でWeb Pushサポート）

### Decision: TOTPライブラリとして`otplib`を採用

- **Context**: TOTPシークレット事前登録機能でOTP自動生成が必要
- **Alternatives Considered**:
  1. speakeasy - 元の要件で言及
  2. otplib - TypeScript-first、最新
  3. otpauth - RFC準拠
- **Selected Approach**: otplib
- **Rationale**:
  - TypeScript-first設計でプロジェクトの型安全性方針に合致
  - セキュリティ監査済み（@noble/hashes, @scure/base）
  - 最新アップデート（v13.1.1）で活発にメンテナンス
- **Trade-offs**: speakeasyからの移行だが、APIは類似しているため問題なし
- **Follow-up**: なし

### Decision: OTP待機中のブラウザセッション維持方式

- **Context**: OTP入力待機中（最大5分）にPlaywrightセッションを維持する必要がある
- **Alternatives Considered**:
  1. インメモリでPageオブジェクトを保持
  2. ブラウザコンテキストをシリアライズして再開
- **Selected Approach**: インメモリでPageオブジェクトを保持
- **Rationale**:
  - 5分のタイムアウトは短く、メモリ負荷は許容範囲
  - Playwrightセッションのシリアライズは複雑で信頼性が低い
  - 個人利用想定のため、同時実行数は少ない
- **Trade-offs**: サーバー再起動時にOTP待機中のジョブは失敗する
- **Follow-up**: 再起動時のジョブ状態リカバリ処理を実装

### Decision: Push Subscriptionの保存場所

- **Context**: Push通知のサブスクリプション情報をどこに保存するか
- **Alternatives Considered**:
  1. Userモデル（現在存在しない）に保存
  2. 新規PushSubscriptionモデルを作成
  3. Accountモデルに保存
- **Selected Approach**: 新規PushSubscriptionモデルを作成
- **Rationale**:
  - 本アプリはシングルユーザー想定だが、将来のマルチデバイス対応を考慮
  - 1デバイス = 1サブスクリプションの関係を明確に管理
  - Accountとは独立した概念
- **Trade-offs**: 新規テーブル追加が必要
- **Follow-up**: エンドポイント（endpoint URL）をユニークキーとして重複登録を防止

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OTP画面のセレクター変更 | 高 | 中 | 各金融機関ごとにOTPセレクターを設定ファイル化し、変更時の更新を容易にする |
| Push通知の配信遅延 | 中 | 低 | タイムアウトを5分に設定し、十分な猶予を確保 |
| サーバー再起動時のOTPジョブ喪失 | 中 | 低 | DBにジョブ状態を永続化し、再起動時に失敗処理または再通知 |
| 開発環境でのWeb Push動作 | 低 | 高 | Cloudflare Tunnel経由での開発を推奨、またはPollingフォールバック |
| TOTPシークレットの漏洩 | 高 | 低 | 既存のAES-256-GCM暗号化と同等のセキュリティを適用 |

---

## References

- [web-push npm](https://www.npmjs.com/package/web-push) — Node.js用Web Pushライブラリ
- [Web Push Protocol - web.dev](https://web.dev/articles/push-notifications-web-push-protocol) — Web Push仕様解説
- [vite-plugin-pwa injectManifest](https://vite-pwa-org.netlify.app/guide/inject-manifest) — カスタムSW実装ガイド
- [otplib](https://www.npmjs.com/package/otplib) — TOTP/HOTPライブラリ
- [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238) — TOTP仕様
- [RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292) — VAPID仕様
