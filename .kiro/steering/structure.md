# Project Structure

## Organization Philosophy

モノレポ構成で `backend/` と `frontend/` を分離。各パッケージは独立したpackage.jsonを持ち、それぞれpnpmで管理する。バックエンドはモジュール指向、フロントエンドはページ指向で構成。

## Directory Patterns

### Backend Modules
**Location**: `backend/src/modules/`
**Purpose**: 機能ドメインごとに分離されたビジネスロジック
**Naming**: kebab-case (例: `auto-rules/`, `transactions/`)
**Pattern**: 各モジュールは `routes.ts`、`service.ts`、`schema.ts` を含む

### Backend Lib
**Location**: `backend/src/lib/`
**Purpose**: モジュール間で共有されるユーティリティ
**Example**: Prismaクライアント初期化、共通ヘルパー関数

### Frontend Pages
**Location**: `frontend/src/pages/`
**Purpose**: ルーティング対象のページコンポーネント
**Naming**: PascalCase (例: `Dashboard.tsx`, `Transactions.tsx`)
**Pattern**: 各ページは自己完結型、API呼び出しとUIを統合

### Frontend Components
**Location**: `frontend/src/components/`
**Purpose**: ページ間で再利用される共通UIコンポーネント
**Naming**: PascalCase (例: `Layout.tsx`, `OfflineIndicator.tsx`)
**Export**: `index.ts` でバレルエクスポート

### Frontend Lib
**Location**: `frontend/src/lib/`
**Purpose**: APIクライアント、QueryClient設定などの共通ロジック
**Example**: `api.ts`（fetch wrapper）、`queryClient.ts`

## Naming Conventions

- **Directories**: kebab-case（バックエンドモジュール）
- **React Components**: PascalCase（`.tsx`）
- **TypeScript Files**: camelCase（`.ts`）、テストは `.test.ts` / `.test.tsx`
- **Prisma Models**: PascalCase（単数形: `Account`, `Transaction`）

## Import Organization

```typescript
// Backend: 相対パスを使用
import { prisma } from '../lib/prisma.js'
import { createRoutes } from './routes.js'

// Frontend: 相対パスを使用（パスエイリアスなし）
import { Layout } from './components'
import { api } from './lib/api'
```

**Note**: パスエイリアスは現在未設定。相対パスで統一。

## Code Organization Principles

- **モジュール境界**: 各バックエンドモジュールは独自のスキーマ定義とルートを持つ
- **データフロー**: フロントエンドはTanStack Queryを介してバックエンドAPIを呼び出し
- **テスト配置**: プロダクションコードと同じディレクトリに `.test.ts(x)` を配置
- **型定義**: フロントエンドの共通型は `src/types/` に配置

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
