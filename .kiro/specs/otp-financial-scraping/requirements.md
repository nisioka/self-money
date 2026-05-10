# Requirements Document

## Introduction

本ドキュメントは、金融機関スクレイピングにおけるOTP（ワンタイムパスワード）・二要素認証対応機能の要件を定義する。

### 背景
- 現在6つの金融機関のスクレイピング機能を実装済み
- すべてログインID + パスワードのみの認証を前提としており、OTP/2FAには未対応
- 多くの金融機関がセキュリティ強化のためOTP/2FAを導入・義務化しており、未対応のため該当金融機関のスクレイピングが失敗する

### 目的
金融機関のスクレイピングにおいて、OTP・二要素認証が求められる場合にユーザーへリアルタイムに通知し、OTP入力を受け付けてスクレイピングを完了できるようにする。

### 対応する認証方式
- **TOTP（Time-based OTP）**: Google Authenticator、認証アプリ等
- **SMS OTP**: SMS経由で送信されるワンタイムパスワード
- **メールOTP**: メール経由で送信されるワンタイムパスワード
- **プッシュ通知承認**: 金融機関アプリでの承認待ち

---

## Requirements

### Requirement 1: OTP画面検知とジョブ一時停止

**Objective:** ユーザーとして、スクレイピング中にOTP入力が求められた場合にシステムが自動検知し、OTP入力を待機してほしい。

#### Acceptance Criteria

1. When スクレイパーがOTP入力画面を検知した場合, the Scraper Service shall スクレイピングジョブを一時停止する
2. When スクレイピングジョブが一時停止された場合, the Scraper Service shall ジョブステータスを`WAITING_FOR_OTP`に更新する
3. When OTP画面検知が発生した場合, the Scraper Service shall 検知した認証方式の種類（TOTP/SMS/メール/プッシュ承認）を記録する
4. While ジョブが`WAITING_FOR_OTP`状態の場合, the Scraper Service shall ブラウザセッションを維持する

---

### Requirement 2: Web Push通知によるユーザー通知

**Objective:** ユーザーとして、OTP入力が必要になった際にリアルタイムで通知を受け取りたい（ブラウザを開いていない状態でも）。

#### Acceptance Criteria

1. When OTP入力が必要になった場合, the Push Notification Service shall ユーザーにWeb Push通知を送信する
2. When Push通知を送信する場合, the Push Notification Service shall タイトル「OTP入力が必要です」、本文「[金融機関名]のスクレイピングでワンタイムパスワードが求められています」を含める
3. When Push通知を送信する場合, the Push Notification Service shall 「OTP入力」アクションボタンを含める
4. The Push Notification Service shall ブラウザが閉じている状態でも通知を配信できる
5. The Push Notification Service shall 通知送信を3秒以内に完了する
6. If Push通知の送信に失敗した場合, then the Push Notification Service shall エラーをログに記録し、再送を1回試行する

---

### Requirement 3: Push通知サブスクリプション管理

**Objective:** ユーザーとして、Push通知を受け取るための登録と管理を行いたい。

#### Acceptance Criteria

1. When ユーザーが初回ログインまたはアカウント設定画面を開いた場合, the Frontend shall Push通知の許可リクエストを表示する
2. When ユーザーがPush通知を許可した場合, the Push Subscription Service shall サブスクリプション情報をデータベースに保存する
3. When ユーザーがPush通知を拒否または取り消した場合, the Push Subscription Service shall サブスクリプション情報をデータベースから削除する
4. The Push Subscription Service shall VAPID認証を使用してサブスクリプションを管理する
5. If サブスクリプションが無効になった場合, then the Push Subscription Service shall ユーザーに再登録を促す

---

### Requirement 4: OTP入力UI

**Objective:** ユーザーとして、OTPを簡単かつ正確に入力できるUIがほしい。

#### Acceptance Criteria

1. When Push通知がクリックされた場合, the Frontend shall OTP入力ダイアログを表示する
2. When OTP入力ダイアログが表示された場合, the Frontend shall 対象アカウント名（金融機関名）を読み取り専用で表示する
3. When OTP入力ダイアログが表示された場合, the Frontend shall 数字のみを受け付けるOTPコード入力フィールド（6桁または8桁）を表示する
4. The Frontend shall 「送信」ボタンと「キャンセル」ボタンを表示する
5. When ユーザーが「キャンセル」ボタンをクリックした場合, the Frontend shall スクレイピングジョブを中止する
6. If OTPフィールドに数字以外が入力された場合, then the Frontend shall 入力を受け付けない

---

### Requirement 5: OTP送信とスクレイピング再開

**Objective:** ユーザーとして、OTPを入力したらスクレイピングが自動的に再開してほしい。

#### Acceptance Criteria

1. When ユーザーがOTPを送信した場合, the OTP Submission Service shall OTPをバックエンドに送信する
2. When バックエンドがOTPを受信した場合, the Scraper Service shall スクレイパーにOTPを引き渡す
3. When スクレイパーがOTPを受け取った場合, the Scraper Service shall OTPを金融機関サイトに入力する
4. When OTP入力が成功した場合, the Scraper Service shall スクレイピングを再開する
5. When スクレイピングが完了した場合, the Scraper Service shall ジョブステータスを`COMPLETED`に更新する
6. If スクレイピングが失敗した場合, then the Scraper Service shall ジョブステータスを`FAILED`に更新する
7. The Scraper Service shall OTP入力後5秒以内にスクレイピングを再開する

---

### Requirement 6: TOTPシークレット事前登録（オプション機能）

**Objective:** ユーザーとして、TOTP方式の金融機関に対してはシークレットキーを事前登録し、OTP入力を自動化したい。

#### Acceptance Criteria

1. Where TOTPシークレットが事前登録されている場合, the TOTP Service shall OTP画面検知時に自動的にOTPを生成する
2. Where TOTPシークレットが事前登録されている場合, the Scraper Service shall 生成されたOTPを自動入力してスクレイピングを継続する
3. When ユーザーがTOTPシークレットを登録する場合, the TOTP Service shall シークレットキーを暗号化（AES-256-GCM）してデータベースに保存する
4. When ユーザーがTOTPシークレットを編集または削除する場合, the Frontend shall アカウント編集画面でその操作を可能にする
5. The TOTP Service shall RFC 6238準拠のTOTPアルゴリズムを使用してOTPを生成する

---

### Requirement 7: タイムアウト処理

**Objective:** ユーザーとして、OTP入力を忘れた場合にシステムが適切にタイムアウト処理を行ってほしい。

#### Acceptance Criteria

1. While ジョブが`WAITING_FOR_OTP`状態の場合, the Scraper Service shall 5分間のタイムアウトタイマーを開始する
2. If OTP入力がタイムアウトした場合, then the Scraper Service shall ジョブを失敗として終了する
3. If OTP入力がタイムアウトした場合, then the Push Notification Service shall ユーザーに再試行を促す通知を送信する
4. When タイムアウトが発生した場合, the Scraper Service shall ブラウザセッションをクリーンアップする

---

### Requirement 8: エラーハンドリング

**Objective:** ユーザーとして、OTP入力エラー時に明確なフィードバックを受け取り、適切に対処したい。

#### Acceptance Criteria

1. If 入力されたOTPが誤っている場合, then the Frontend shall エラーメッセージ「OTPが正しくありません。再入力してください」を表示する
2. If OTP入力が3回連続で失敗した場合, then the Scraper Service shall スクレイピングを中止する
3. If OTP入力が3回連続で失敗した場合, then the Frontend shall エラーメッセージ「OTP入力に複数回失敗しました。金融機関サイトで直接ご確認ください」を表示する
4. When OTP関連エラーが発生した場合, the Scraper Service shall エラー内容をログに記録する
5. When OTP関連エラーが発生した場合, the Dashboard shall エラー情報を表示する

---

### Requirement 9: セキュリティ要件

**Objective:** ユーザーとして、OTP関連の処理が安全に行われることを保証してほしい。

#### Acceptance Criteria

1. The System shall HTTPS環境でのみService WorkerとWeb Push APIを動作させる
2. The Push Notification Service shall VAPID認証を使用してWeb Push通知を送信する
3. The System shall ユーザーが入力したOTPをログに記録しない
4. The TOTP Service shall TOTPシークレットを既存の資格情報と同等の暗号化（AES-256-GCM）で保存する
5. The System shall OTPを一時的なメモリ上でのみ処理し、永続化しない

---

### Requirement 10: 可用性・リカバリ要件

**Objective:** ユーザーとして、システム停止時にもOTP待機中のジョブが適切に管理されてほしい。

#### Acceptance Criteria

1. While ジョブが`WAITING_FOR_OTP`状態の場合, the Scraper Service shall ジョブ情報をデータベースに永続化する
2. When ローカルマシンが再起動された場合, the Scraper Service shall 未完了のOTP待機ジョブを検出する
3. When 未完了のOTP待機ジョブが検出された場合, the Scraper Service shall ジョブを失敗として処理するか、再度OTP通知を送信する
4. The System shall OTP待機中のジョブ状態をブラウザリロード後も維持する

---

### Requirement 11: Service Worker実装

**Objective:** システムとして、バックグラウンドでPush通知を受信し処理できる必要がある。

#### Acceptance Criteria

1. The Service Worker shall `push`イベントを受信して通知を表示する
2. When 通知がクリックされた場合, the Service Worker shall アプリケーションウィンドウをフォーカスまたは新規オープンする
3. When 通知がクリックされた場合, the Service Worker shall OTP入力ダイアログを表示するためのメッセージをクライアントに送信する
4. The Service Worker shall vite-plugin-pwaの`injectManifest`戦略でカスタム実装される
5. The Service Worker shall オフライン時もPush通知を受信できる

---

## Project Description (Reference)

以下は本要件の元となったプロジェクト説明の参照用アーカイブです。

<details>
<summary>オリジナルの要件定義書</summary>

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

## 2. 目的

金融機関のスクレイピングにおいて、OTP・二要素認証が求められる場合にユーザーへリアルタイムに通知し、OTP入力を受け付けてスクレイピングを完了できるようにする。

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

</details>
