# Technology Stack

## Architecture

モノレポ構成によるフロントエンド/バックエンド分離アーキテクチャ。バックエンドはREST APIを提供し、フロントエンドはSPAとして動作する。

## Core Technologies

### Backend
- **Language**: TypeScript (ES2022, strict mode)
- **Runtime**: Node.js 20+
- **Framework**: Fastify 5
- **ORM**: Prisma (SQLite)
- **Package Manager**: pnpm 10+

### Frontend
- **Language**: TypeScript (ES2022, strict mode)
- **Framework**: React 19 + Vite 7
- **Styling**: Tailwind CSS 4
- **Data Fetching**: TanStack Query 5
- **Routing**: React Router 7
- **Charts**: Recharts 3

## Key Libraries

### Backend
- **Playwright**: 金融機関サイトのWebスクレイピング
- **Zod**: リクエストバリデーション
- **node-cron**: スケジュールジョブ実行
- **AES-256-GCM**: 認証情報の暗号化

### Frontend
- **vite-plugin-pwa**: PWA対応・オフライン機能

## Development Standards

### Type Safety
- TypeScript strict mode有効
- `noUncheckedIndexedAccess`: true（バックエンド）
- `noUnusedLocals`, `noUnusedParameters`: true（フロントエンド）

### Code Quality
- ESLint（フロントエンド）
- ESM (ECMAScript Modules) 統一

### Testing
- Vitest（バックエンド・フロントエンド共通）
- Testing Library（フロントエンドコンポーネント）

## Development Environment

### Required Tools
- Node.js 20+
- pnpm 10+

### Common Commands
```bash
# Backend
pnpm dev        # 開発サーバー（tsx watch）
pnpm build      # TypeScriptビルド
pnpm test       # Vitestテスト
pnpm db:push    # Prismaスキーマ適用
pnpm db:studio  # Prisma Studio起動

# Frontend
pnpm dev        # Vite開発サーバー
pnpm build      # 本番ビルド
pnpm test       # Vitestテスト
pnpm lint       # ESLint実行
```

## Key Technical Decisions

- **SQLite採用**: 個人利用想定のため、外部DBサーバー不要でポータブルな構成を優先
- **Fastify採用**: Express互換でありながら高パフォーマンス、TypeScript親和性が高い
- **Playwright採用**: 金融機関サイトのSPA対応・二要素認証等の複雑な操作に対応可能
- **ESM統一**: `"type": "module"`で統一し、モダンなモジュールシステムを採用

---
_Document standards and patterns, not every dependency_
