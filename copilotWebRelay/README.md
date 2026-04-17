# Copilot Web Relay — AI チャット Web アプリケーション

[GitHub Copilot SDK](https://github.com/github/copilot-sdk) を利用して構築された、ブラウザ上で動作するリアルタイム AI チャットアプリケーションです。

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)

## 機能

- 🤖 **Copilot SDK 統合** — `CopilotClient` によるセッション管理
- ⚡ **ストリーミングレスポンス** — `assistant.message_delta` イベントでリアルタイム表示
- 🔌 **WebSocket 通信** — 低遅延の双方向通信
- 📝 **Markdown レンダリング** — コードブロック・テーブル・リストなどに対応 (GFM)
- 🎨 **モダン UI** — GitHub 風ダークテーマのチャットインターフェース
- 🔄 **自動再接続** — 接続切断時に 3 秒後に自動復帰

---

## アーキテクチャ

```
┌──────────────────┐    WebSocket     ┌──────────────────────┐    JSON-RPC    ┌─────────────┐
│   React Client   │ ◄─────────────► │  Express + WS Server │ ◄───────────► │ Copilot CLI │
│   (Vite :5173)   │                  │       (:3001)        │               │  (SDK内蔵)   │
└──────────────────┘                  └──────────────────────┘               └─────────────┘
     ブラウザ                              Node.js バックエンド                  AI エンジン
```

### データフロー

1. ユーザーがチャット入力欄にメッセージを入力し送信
2. クライアントが WebSocket 経由で `{ type: "chat", content: "..." }` を送信
3. サーバーが `session.send({ prompt })` で Copilot SDK にメッセージを転送
4. SDK が `assistant.message_delta` イベントを発火 → サーバーが `{ type: "delta" }` としてクライアントへストリーミング
5. SDK が `session.idle` イベントを発火 → サーバーが `{ type: "idle" }` で完了を通知
6. クライアントがストリーミングカーソルを停止し、レスポンス表示を確定

---

## ディレクトリ構成

```
copilotWebRelay/
├── package.json            # ルート (concurrently で同時起動)
├── server/
│   ├── package.json        # バックエンド依存関係
│   ├── tsconfig.json
│   └── src/
│       └── index.ts        # Express + WebSocket + Copilot SDK サーバー
└── client/
    ├── package.json        # フロントエンド依存関係
    ├── tsconfig.json
    ├── vite.config.ts      # Vite 設定 (プロキシ含む)
    ├── index.html          # エントリ HTML
    └── src/
        ├── main.tsx        # React エントリポイント
        ├── App.tsx         # アプリケーションルート
        ├── App.css         # グローバルスタイル (ダークテーマ)
        ├── vite-env.d.ts   # Vite 型定義
        └── components/
            └── Chat.tsx    # チャット UI コンポーネント
```

---

## セットアップ

### 前提条件

- **Node.js** 18 以上
- **GitHub Copilot サブスクリプション** (Free, Pro, Business, Enterprise のいずれか)
- Copilot CLI にログイン済みであること（`copilot auth login` または `GITHUB_TOKEN` 環境変数）

### インストール

```bash
cd copilotWebRelay

# ルート + サーバー + クライアントの依存関係を一括インストール
npm run install:all

# ルート自身の devDependencies (concurrently)
npm install
```

### 起動

```bash
# バックエンド (port 3001) + フロントエンド (port 5173) を同時起動
npm run dev
```

ブラウザで **http://localhost:5173** を開くとチャット画面が表示されます。

### 個別起動

```bash
# バックエンドのみ
npm run dev:server    # → http://localhost:3001

# フロントエンドのみ
npm run dev:client    # → http://localhost:5173
```

### プロダクションビルド

```bash
npm run build         # client/dist/ に出力
```

---

## npm スクリプト一覧

| スクリプト | 説明 |
|---|---|
| `npm run dev` | サーバー・クライアントを同時起動 |
| `npm run dev:server` | バックエンドのみ起動 (tsx watch) |
| `npm run dev:client` | フロントエンドのみ起動 (vite) |
| `npm run install:all` | server/ と client/ の依存関係をまとめてインストール |
| `npm run build` | フロントエンドのプロダクションビルド |

---

## 技術スタック

### バックエンド (`server/`)

| パッケージ | バージョン | 用途 |
|---|---|---|
| `@github/copilot-sdk` | latest | Copilot CLI との JSON-RPC 通信 |
| `express` | ^4.21 | HTTP サーバー / ヘルスチェック |
| `ws` | ^8.18 | WebSocket サーバー |
| `cors` | ^2.8 | CORS 対応 |
| `tsx` | ^4.19 | TypeScript の直接実行 (開発) |
| `typescript` | ^5.6 | 型チェック |

### フロントエンド (`client/`)

| パッケージ | バージョン | 用途 |
|---|---|---|
| `react` | ^19.0 | UI ライブラリ |
| `react-dom` | ^19.0 | DOM レンダリング |
| `react-markdown` | ^9.0 | Markdown → React 変換 |
| `remark-gfm` | ^4.0 | GitHub Flavored Markdown 対応 |
| `vite` | ^6.0 | 開発サーバー / ビルドツール |
| `@vitejs/plugin-react` | ^4.3 | React Fast Refresh |
| `typescript` | ^5.6 | 型チェック |

---

## WebSocket プロトコル

クライアント ↔ サーバー間の WebSocket メッセージ仕様:

### クライアント → サーバー

| type | フィールド | 説明 |
|---|---|---|
| `chat` | `content: string` | ユーザーのチャットメッセージ |

### サーバー → クライアント

| type | フィールド | 説明 |
|---|---|---|
| `connected` | `sessionId: string` | Copilot セッション確立完了 |
| `delta` | `content: string` | ストリーミングレスポンスの差分テキスト |
| `idle` | — | レスポンス生成完了 |
| `error` | `message: string` | エラー発生 |

---

## 設定・カスタマイズ

### モデルの変更

`server/src/index.ts` の `createSession()` で使用モデルを変更できます:

```typescript
session = await client.createSession({
  model: "gpt-4.1",           // ← ここを変更
  streaming: true,
  onPermissionRequest: approveAll,
});
```

利用可能なモデル例:

| モデル ID | 課金 | 備考 |
|---|---|---|
| `gpt-4.1` | Free | デフォルト |
| `gpt-5-mini` | Free | 軽量版 |
| `gpt-5.4` | Premium | 高性能 |
| `claude-sonnet-4.5` | Premium | Anthropic Claude |
| `claude-opus-4.6` | Premium (3x) | 最高性能 |

### サーバーポートの変更

```bash
PORT=8080 npm run dev:server
```

### 認証

SDK は以下の優先順位で認証情報を探します:

1. `COPILOT_GITHUB_TOKEN` 環境変数
2. `GH_TOKEN` 環境変数
3. `GITHUB_TOKEN` 環境変数
4. `copilot auth login` でログイン済みのユーザー情報

---

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/health` | ヘルスチェック (`{ "status": "ok" }`) |
| WebSocket | `/` (ws://localhost:3001) | チャット WebSocket 接続 |

---

## トラブルシューティング

### "Failed to initialize Copilot session"

Copilot CLI の認証が必要です:

```bash
copilot auth login
# または
export GITHUB_TOKEN=ghp_xxxxx
```

### "Model X is not available"

指定したモデルがサブスクリプションプランで利用できません。  
`gpt-4.1` (Free) に変更するか、プランをアップグレードしてください。

### WebSocket 接続が切れる

クライアントは 3 秒後に自動再接続します。  
サーバーが起動していることを確認してください:

```bash
curl http://localhost:3001/health
```

---

## ライセンス

MIT
