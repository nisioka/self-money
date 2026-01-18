# 金融機関スクレイピングにおけるOTP・二要素認証対応機能 要件定義

## 1. 背景・課題

### 現状
- 現在6つの金融機関のスクレイピング機能を実装済み（三菱UFJ、三井住友、SBI新生、楽天銀行、楽天証券、ポケットカード）
- すべてログインID + パスワードのみの認証を前提としている
- ワンタイムパスワード（OTP）や二要素認証（2FA）には未対応

### 課題
- 多くの金融機関がセキュリティ強化のためOTP/2FAを導入・義務化している
- OTP未対応のため、該当金融機関のスクレイピングが失敗する
- エラータイプ`TWO_FACTOR_REQUIRED`は定義されているが実装されていない（`scraper.types.ts:28`）

### 技術的準備状況
- ✅ Playwright採用により複雑な操作への対応は可能
- ✅ PWA基盤（`vite-plugin-pwa`）導入済み
- ✅ Service Worker自動生成・更新の設定完了
- ✅ 要件ドキュメントで二段階認証失敗時の処理が定義済み

---

## 2. 目的

金融機関のスクレイピングにおいて、OTP・二要素認証が求められる場合にユーザーへリアルタイムに通知し、OTP入力を受け付けてスクレイピングを完了できるようにする。

---

## 3. 対象範囲

### 3.1 対応する認証方式
- **TOTP（Time-based OTP）**: Google Authenticator、認証アプリ等
- **SMS OTP**: SMS経由で送信されるワンタイムパスワード
- **メールOTP**: メール経由で送信されるワンタイムパスワード
- **プッシュ通知承認**: 金融機関アプリでの承認待ち

### 3.2 実装対象
- バックエンド：Web Push通知送信機能
- フロントエンド：Push通知受信、OTP入力UI
- Service Worker：プッシュ通知処理
- スクレイパー：OTP画面検知とOTP入力処理
- データベース：Push Subscription保存

---

## 4. 機能要件

### FR-1: OTP画面の検知
- スクレイパーがOTP入力画面を検知できること
- 検知時にスクレイピングジョブを一時停止すること
- ジョブステータスを`WAITING_FOR_OTP`に変更すること

### FR-2: ユーザーへのリアルタイム通知
- OTP入力が必要になった際、ユーザーにWeb Push通知を送信すること
- 通知内容：
  - タイトル: 「OTP入力が必要です」
  - 本文: 「[金融機関名]のスクレイピングでワンタイムパスワードが求められています」
  - アクション: 「OTP入力」ボタン
- 通知はブラウザ外（タブを閉じている状態）でも受信できること

### FR-3: Push通知サブスクリプション管理
- 初回ログイン時またはアカウント設定画面で、Push通知の許可を求めること
- Push Subscriptionをユーザーごとにデータベースに保存すること
- サブスクリプションの有効期限管理と再登録処理を実装すること

### FR-4: OTP入力UI
- 通知クリック時、OTP入力ダイアログを表示すること
- 入力フィールド：
  - OTPコード（6桁または8桁の数字）
  - 対象アカウント名の表示（読み取り専用）
- ボタン：
  - 「送信」: OTPをバックエンドに送信
  - 「キャンセル」: スクレイピングを中止

### FR-5: OTP送信とスクレイピング再開
- ユーザーが入力したOTPをバックエンドに送信すること
- バックエンドがスクレイパーにOTPを引き渡すこと
- スクレイパーがOTPを入力してスクレイピングを再開すること
- スクレイピング完了後、ジョブステータスを`COMPLETED`または`FAILED`に更新すること

### FR-6: TOTPシークレット事前登録（オプション）
- TOTP方式の金融機関に対しては、シークレットキーを事前登録できること
- 事前登録されている場合、自動的にOTPを生成してスクレイピングを継続すること
- シークレットキーは暗号化してデータベースに保存すること

### FR-7: タイムアウト処理
- OTP入力待機時間の上限を設定すること（デフォルト: 5分）
- タイムアウト時はスクレイピングジョブを失敗にすること
- ユーザーに再試行を促す通知を送信すること

### FR-8: エラーハンドリング
- OTP入力が誤っている場合、エラーメッセージを表示すること
- 複数回（3回）失敗した場合、スクレイピングを中止すること
- エラー内容をログに記録し、ダッシュボードに表示すること

---

## 5. 非機能要件

### NFR-1: セキュリティ
- **HTTPS必須**: Service Worker、Web Push APIはHTTPS環境でのみ動作
- **VAPID認証**: Web Push送信時にVAPID鍵による認証を実施
- **OTPの非保存**: ユーザーが入力したOTPはログに記録しない
- **TOTPシークレット暗号化**: 事前登録されたTOTPシークレットは既存の資格情報と同等の暗号化を適用

### NFR-2: 可用性
- **ローカルマシン稼働前提**: スクレイピング中にローカルマシンが停止した場合、再起動時に未完了ジョブを検出してOTP通知を再送
- **ジョブキュー永続化**: OTP待機中のジョブ情報をデータベースに保存

### NFR-3: パフォーマンス
- Push通知送信は3秒以内に完了すること
- OTP入力後のスクレイピング再開は5秒以内に開始すること

### NFR-4: ユーザビリティ
- 通知許可のリクエストは、過度に煩わしくないタイミングで実施すること（初回ログイン時または設定画面）
- OTP入力ダイアログは直感的で、入力ミスを最小限にする設計とすること（数字のみ受付、桁数制限）

### NFR-5: 保守性
- Web Pushの外部サービス（FCM、Mozilla Push Service）の仕様変更に対応できる抽象化層を設けること
- 新しい認証方式（生体認証等）の追加を容易にする設計とすること

---

## 6. 技術方針

### 6.1 通知方式の選択
**採用: Service Worker + Web Push API**

**選定理由:**
1. ✅ 既にPWA基盤（`vite-plugin-pwa`）導入済み
2. ✅ ブラウザ外（タブ閉じた状態）でも通知可能
3. ✅ ローカルマシン + Cloudflare Tunnelの構成で動作可能
   - Cloudflare TunnelがHTTPS自動化（証明書管理不要）
   - Web Pushは外部サービス経由のため、Tunnelの有無は無関係
4. ✅ モバイルアプリのような体験を提供

**不採用とした方式:**
- **WebSocket**: 双方向通信だが、実装が複雑、ロードバランサー対応が必要
- **SSE**: シンプルだが、サーバー→クライアント一方向のみ
- **Polling**: TanStack Queryと相性は良いが、リアルタイム性が低い

### 6.2 アーキテクチャ

```
[ローカルマシン]
  スクレイパー (Playwright)
    ↓ OTP画面検知
  バックエンド (Fastify + web-push)
    ↓ Web Push送信
[外部Push Service]
  Google FCM / Mozilla Push Service
    ↓ プッシュ配信
[ユーザーのブラウザ]
  Service Worker
    ↓ 通知表示
  フロントエンド (React)
    ↓ OTP入力
  バックエンドAPI
    ↓ OTP送信
  スクレイパー再開
```

### 6.3 使用技術
- **バックエンド**: `web-push` (npm package)
- **フロントエンド**: `virtual:pwa-register/react` (vite-plugin-pwa)
- **Service Worker**: カスタムSW（`vite-plugin-pwa`の`injectManifest`戦略）
- **TOTP生成**: `speakeasy` (TOTPシークレット事前登録機能用)

### 6.4 環境変数
```bash
# .env
VAPID_PUBLIC_KEY=<生成されたVAPID公開鍵>
VAPID_PRIVATE_KEY=<生成されたVAPID秘密鍵>
VAPID_SUBJECT=mailto:your-email@example.com
BASE_URL=https://yourdomain.com  # Cloudflare Tunnel URL
```

---

## 7. 実装フロー

### Phase 1: 基盤整備
1. VAPID鍵生成（`npx web-push generate-vapid-keys`）
2. 環境変数設定（`.env`への追加）
3. DBスキーマ拡張
   - `users`テーブルに`push_subscription`カラム追加（JSON型）
   - `accounts`テーブルに`totp_secret`カラム追加（暗号化TEXT型、オプション）
4. ジョブステータス拡張（`WAITING_FOR_OTP`状態の追加）

### Phase 2: バックエンド実装
5. `web-push`ライブラリ導入
6. Push Subscriptionエンドポイント実装
   - `POST /api/push/subscribe`: サブスクリプション保存
   - `DELETE /api/push/unsubscribe`: サブスクリプション削除
7. OTP通知送信機能実装
   - `ScraperService.notifyOtpRequired(userId, accountId)`
8. OTP受信エンドポイント実装
   - `POST /api/scraping/:jobId/submit-otp`: OTP受信とスクレイピング再開
9. TOTP生成機能実装（オプション）
   - `speakeasy`を使ったTOTP自動生成

### Phase 3: スクレイパー拡張
10. ベーススクレイパーにOTP処理追加
    - `waitForOtp()`: OTP入力待機メソッド
    - `submitOtp(otp: string)`: OTP入力メソッド
11. 各金融機関スクレイパーの更新
    - OTP画面のセレクター定義
    - OTP検知ロジック追加

### Phase 4: フロントエンド実装
12. カスタムService Worker実装（`src/sw.ts`）
    - `push`イベントハンドラー
    - `notificationclick`イベントハンドラー
13. Push通知登録UI実装
    - 初回ログイン時またはアカウント設定での許可リクエスト
    - `usePushNotification`カスタムフック
14. OTP入力ダイアログUI実装
    - モーダルコンポーネント
    - 数字入力フィールド（6桁/8桁）
15. TOTPシークレット設定UI実装（オプション）
    - アカウント編集画面にTOTPシークレット入力フィールド追加

### Phase 5: テスト・統合
16. 単体テスト
    - VAPID署名検証
    - TOTP生成ロジック
17. 統合テスト
    - OTP検知→通知送信→OTP入力→スクレイピング再開のE2Eフロー
18. Cloudflare Tunnel環境での動作確認
    - HTTPS経由でのPush通知動作
    - Service Worker登録・更新

---

## 8. Cloudflare Tunnel特有の考慮事項

### 8.1 問題ない点
- ✅ HTTPS自動化により証明書管理不要
- ✅ 固定URL使用によりVAPID設定が安定
- ✅ Web Pushは外部サービス経由のため、Tunnelの影響を受けない

### 8.2 考慮すべき点

**カスタムドメイン推奨**
- Tunnel URLが変更されると既存のPush Subscriptionが無効化される可能性
- カスタムドメイン設定（例: `budget.yourdomain.com`）を推奨
- 環境変数`BASE_URL`でドメイン管理

**ローカルマシンの稼働管理**
- スクレイピング中にマシンが停止した場合の対策
  - ジョブキューに未完了ジョブを保存
  - 再起動時に未完了ジョブを検出してOTP通知を再送

**開発環境での動作**
- ローカル開発時（HTTP環境）での対処
  - Cloudflare Tunnel経由で開発（`cloudflared tunnel --url localhost:5173`）
  - または開発時はPolling方式にフォールバック

---

## 9. 成功基準

- [ ] ユーザーがOTPを求められた際、5秒以内にPush通知を受信できる
- [ ] 通知からOTP入力、スクレイピング再開までのUXがスムーズである（30秒以内に完了）
- [ ] TOTP対応金融機関で、シークレット事前登録により完全自動化が可能
- [ ] OTP入力失敗時、明確なエラーメッセージが表示される
- [ ] Cloudflare Tunnel + HTTPS環境でPush通知が正常に動作する
- [ ] タブを閉じている状態でもPush通知を受信できる

---

## 10. 将来の拡張性

- **SMS自動取得**: Twilio等のSMS受信APIと連携し、SMS OTPを自動取得
- **メール自動取得**: IMAPで受信メールを監視し、メールOTPを自動取得
- **生体認証対応**: WebAuthn APIを使った生体認証フロー
- **マルチデバイス対応**: 複数デバイスでのPush Subscription管理

---

## 11. 参考資料

- Web Push API仕様: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- VAPID仕様: https://datatracker.ietf.org/doc/html/rfc8292
- Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/
- web-push (npm): https://www.npmjs.com/package/web-push
- speakeasy (npm): https://www.npmjs.com/package/speakeasy
