# self-money

個人向け家計簿Webアプリケーション。Webスクレイピングによる金融機関自動連携とAI（Gemini API）を活用した費目自動分類を特徴とする。

## 機能

- **金融機関自動連携**: 6つの金融機関（楽天銀行、三井住友銀行、三菱UFJ銀行、SBI新生銀行、楽天証券、ポケットカード）からの取引データ自動取得
- **AI費目自動分類**: Gemini APIによる費目推論とルールベース学習
- **取引管理**: 手動入力、編集、削除
- **月次集計・分析**: 収支サマリー、費目別内訳（円グラフ）、月別推移（棒グラフ）
- **口座・残高管理**: 口座種別ごとのグループ化表示
- **非同期ジョブ管理**: スクレイピングのバックグラウンド実行
- **PWA対応**: モバイル端末でのインストール・オフライン利用

## 技術スタック

### バックエンド
- **Runtime**: Node.js + TypeScript
- **Framework**: Fastify
- **ORM**: Prisma (SQLite)
- **Scraping**: Playwright
- **Scheduler**: node-cron
- **Validation**: Zod

### フロントエンド
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query
- **Charts**: Recharts
- **PWA**: vite-plugin-pwa

## 必要条件

- Node.js 20以上
- pnpm 10以上

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/self-money.git
cd self-money
```

### 2. バックエンドのセットアップ

```bash
cd backend

# 依存関係のインストール
pnpm install

# 環境変数の設定
cp .env.example .env

# マスターキーの生成と設定
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 出力された値を .env の MASTER_KEY に設定

# データベースの初期化
pnpm db:generate
pnpm db:push
```

### 3. フロントエンドのセットアップ

```bash
cd ../frontend

# 依存関係のインストール
pnpm install
```

## 環境変数

バックエンド（`backend/.env`）:

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `DATABASE_URL` | SQLiteデータベースのパス | `file:./dev.db` |
| `PORT` | サーバーポート | `3000` |
| `HOST` | サーバーホスト | `0.0.0.0` |
| `MASTER_KEY` | 認証情報暗号化用マスターキー（32バイトHex） | 必須 |
| `GEMINI_API_KEY` | Gemini API キー（AI分類に必要） | オプション |
| `CRON_SCHEDULE` | スクレイピング実行スケジュール | `0 3 * * *`（毎日3時） |

## 開発

### バックエンド

```bash
cd backend

# 開発サーバー起動（ホットリロード付き）
pnpm dev

# テスト実行
pnpm test

# ビルド
pnpm build

# 本番サーバー起動
pnpm start

# Prisma Studio（DBブラウザ）
pnpm db:studio
```

### フロントエンド

```bash
cd frontend

# 開発サーバー起動
pnpm dev

# テスト実行
pnpm test

# ビルド
pnpm build

# プレビュー
pnpm preview

# Lint
pnpm lint
```

## 開発サーバー

バックエンドとフロントエンドを別々のターミナルで起動:

```bash
# ターミナル1: バックエンド (http://localhost:3000)
cd backend && pnpm dev

# ターミナル2: フロントエンド (http://localhost:5173)
cd frontend && pnpm dev
```

ブラウザで http://localhost:5173 にアクセス。

## プロジェクト構造

```
self-money/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma      # データベーススキーマ
│   ├── src/
│   │   ├── index.ts           # エントリーポイント
│   │   ├── lib/               # 共通ライブラリ
│   │   └── modules/           # 機能モジュール
│   │       ├── accounts/      # 口座管理
│   │       ├── analytics/     # 月次集計・分析
│   │       ├── autoRules/     # 分類ルール管理
│   │       ├── categories/    # 費目管理
│   │       ├── classifier/    # AI費目分類
│   │       ├── jobs/          # ジョブ管理
│   │       ├── scraper/       # スクレイピング
│   │       ├── security/      # 暗号化
│   │       ├── transactions/  # 取引管理
│   │       └── worker/        # バックグラウンドワーカー
│   └── .env.example
├── frontend/
│   ├── public/                # 静的ファイル
│   ├── src/
│   │   ├── components/        # 共通コンポーネント
│   │   ├── pages/             # ページコンポーネント
│   │   ├── hooks/             # カスタムフック
│   │   ├── api/               # APIクライアント
│   │   └── App.tsx
│   └── vite.config.ts
└── README.md
```

## API エンドポイント

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/accounts` | 口座一覧取得 |
| POST | `/api/accounts` | 口座登録 |
| PATCH | `/api/accounts/:id` | 口座更新 |
| DELETE | `/api/accounts/:id` | 口座削除 |
| GET | `/api/transactions` | 取引一覧取得 |
| POST | `/api/transactions` | 取引登録 |
| PATCH | `/api/transactions/:id` | 取引更新 |
| DELETE | `/api/transactions/:id` | 取引削除 |
| GET | `/api/categories` | 費目一覧取得 |
| POST | `/api/categories` | 費目登録 |
| PATCH | `/api/categories/:id` | 費目更新 |
| DELETE | `/api/categories/:id` | 費目削除 |
| GET | `/api/jobs` | ジョブ一覧取得 |
| POST | `/api/jobs` | ジョブ投入 |
| GET | `/api/jobs/:id` | ジョブ詳細取得 |
| GET | `/api/analytics/monthly` | 月次サマリー取得 |
| GET | `/api/analytics/categories` | 費目別内訳取得 |
| GET | `/api/analytics/trend` | 月別推移取得 |

## 本番デプロイ

### ビルド

```bash
# バックエンド
cd backend
pnpm build

# フロントエンド
cd ../frontend
pnpm build
```

### 実行

```bash
# バックエンドサーバー起動
cd backend
NODE_ENV=production pnpm start

# フロントエンドは dist/ を静的ファイルサーバーで配信
# または Nginx/Caddy 等でリバースプロキシ設定
```

## 注意事項

- **スクレイピングについて**: 金融機関のWebサイト仕様変更により、スクレイピング機能が動作しなくなる可能性があります
- **セキュリティ**: 認証情報はAES-256-GCMで暗号化されますが、マスターキーの管理には十分注意してください
- **個人利用向け**: 本アプリケーションは開発者本人の個人利用を想定しています

## ライセンス

[LICENSE](LICENSE) を参照してください。
