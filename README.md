# AI推し活プランナー

ライブやイベントの情報から、OpenAI APIが当日のスケジュール、持ち物チェックリスト、予算配分、推し活のアドバイスを提案するWebアプリです。チェックリストの準備数と予算の合計・残額は画面上で計算します。

## ローカルで起動

必要なもの: Node.js 18以上、OpenAI APIキー。

```bash
npm install
npm start
```

プロジェクト直下の`.env.local`にAPIキーを設定します。このファイルはサーバー側だけで読み込み、ブラウザーへ送信しません。

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=8080
```

ブラウザーで `http://localhost:8080` を開きます。画面の使い方ガイドに沿ってイベント情報を入力し、「わたしのプランを作る」を押してください。開発時に自動再起動する場合は `npm run dev` を使えます。

## 課題要件を満たす処理

- `public/index.html` で推し・イベントの条件を入力します。
- `prompt.md` でJSONのキーとデータ形式を指定し、不明なイベント情報や金額は目安として扱うよう指示します。
- `server.js` は既存の`POST /api/`とテンプレート置換を使ってOpenAI APIに接続します。`response_format`でJSON Schemaを厳密に指定し、OpenAIから受け取ったJSON文字列を`JSON.parse()`します。APIキーはサーバー環境変数`OPENAI_API_KEY`から読み込みます。
- `public/app.js` が取得したJSONをもとに画面要素を生成し、持ち物のチェック数と予算合計・残額を計算します。内訳合計が予算を超える場合は注意を表示します。

## Render.com

Web Serviceとしてデプロイします。

- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `OPENAI_API_KEY` にAPIキーを設定

Node.js 18以上を指定し、Renderが設定する`PORT`環境変数をそのまま利用します。
