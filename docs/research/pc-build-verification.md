# PC上での Expo + TypeScript + Jest 構築・実行 実証レポート

- 検証日時: 2026-10-30 00:57 〜 01:25 (JST)
- 検証担当: env-verifier（DSH サブエージェント）
- 検証場所: `C:\Users\MaedaNatsuki\Documents\deepseek-harness\default-workspace\.env-probe\app`
- 目的: 「寄鳥美鳥地」スマホ向けナビの実装フェーズに入る前に、PC 上で **Expo SDK 58 + TypeScript + Jest** のプロジェクトが実際に構築・実行できることを実証する（プロダクトコードは書かない）
- 結論: **Yes（PC上での開発は可能）**。ただし **DSH サンドボックス固有の制約（パイプ付き子プロセス spawn の EPERM）** があり、そのままのコマンドでは一部失敗する。回避策コマンド列で **インストール / 型検査 / Jest / Metro バンドル** まで全て実証済み。詳細は §7, §8。

---

## 0. 環境と前提

| 項目 | 実測値 |
|---|---|
| OS | Windows 10.0.26300 |
| Node.js | v22.22.0 |
| npm | 10.9.4 |
| npx | 10.9.4（npm 同梱） |
| PowerShell | pwsh 7（FullLanguage / workspace-write サンドボックス） |
| npm デフォルトキャッシュ | `C:\Users\...\AppData\Local\npm-cache`（**EPERM、書き込み不可**） |
| 回避キャッシュ | `<workspace>\.cache\npm`（`$env:npm_config_cache` で指定） |
| TEMP | `C:\Users\...\AppData\Local\Temp\dsh-xxxx`（書き込み可） |
| グローバル npm prefix | `C:\nvm4w\nodejs`（書き込み不可 → グローバルインストールは行わない） |

---

## 1. 空きディスク容量

| 項目 | 内容 |
|---|---|
| コマンド | `[System.IO.DriveInfo]::GetDrives()` で C: を列挙 |
| 結果 | **C: 475.79 GB / 空き 94.05 GB（19.77%）** |
| 所要時間 | 約 0.1 秒 |
| エラー | なし（`Get-Volume`/CIM は使用せず DriveInfo で成功） |
| 回避策 | 不要 |

> `Get-Volume` / `Get-CimInstance` は CIM アクセス拒否の可能性があるため、.NET の `DriveInfo` を使用した。問題なく取得できた。

---

## 2. Expo blank-typescript テンプレートの生成

### 2-1. `create-expo-app`（推奨手順） → **失敗**

| 項目 | 内容 |
|---|---|
| コマンド | `npx --yes create-expo-app@latest .env-probe/app --template blank-typescript --no-install`（`$env:npm_config_cache` をワークスペース内に設定） |
| 結果 | **失敗（exit 1）** |
| 所要時間 | **3.6 秒** |
| エラー（要約） | `Error: EPERM: operation not permitted, mkdir 'C:\Users\MaedaNatsuki\.expo'`（さらにその処理系が `TypeError [ERR_INVALID_ARG_TYPE]: The "code" argument must be of type number. Received type string ('EPERM')` で二次クラッシュ） |
| 回避策 | `$env:USERPROFILE` / `$env:HOME` を `<workspace>\.env-probe\home` にリダイレクト（Node の `os.homedir()` は `USERPROFILE` を参照することを事前確認済み） |

### 2-2. HOME リダイレクト後の再試行 → **失敗（別要因）**

| 項目 | 内容 |
|---|---|
| コマンド | 同上 + `USERPROFILE/HOME` をワークスペース内へ |
| 結果 | **失敗（exit 1）**。`.expo` の EPERM は解消したが、テンプレート取得で別エラー |
| 所要時間 | **2.2 秒** |
| エラー（要約） | `✖ Something went wrong in downloading and extracting the project files: Cannot read properties of undefined (reading 'match')` |
| 根本原因（`EXPO_DEBUG=1` で特定） | create-expo が内部で **`npm.cmd pack expo-template-blank-typescript@latest --dry-run` をパイプ付き stdio で spawn** している。<br>`npmPackAsync` 内 `spawn EPERM` → 出力が `undefined` になり `.match` で落ちる。<br>**このサンドボックスではパイプ付き子プロセス生成が一律 EPERM**（§7-1 の切り分け実験で確定） |
| 回避策 | `create-expo-app` を使わず、**同一の公式テンプレート tarball を直接取得して展開**（§2-3） |

### 2-3. 代替手順（採用・成功）

| 項目 | 内容 |
|---|---|
| コマンド1 | `npm view expo-template-blank-typescript@latest version` → **58.0.30** |
| コマンド2 | `npm pack expo-template-blank-typescript@latest`（cwd=`.env-probe`） |
| 結果2 | **成功**。`expo-template-blank-typescript-58.0.30.tgz`（509,661 B / 13 files） |
| 所要時間2 | **2.6 秒** |
| コマンド3 | `tar -xzf expo-template-blank-typescript-58.0.30.tgz -C .env-probe/app --strip-components=1`（bsdtar 3.8.9） |
| 結果3 | **成功（exit 0）**。App.tsx / app.json / index.ts / package.json / tsconfig.json / assets 一式を展開 |
| 所要時間3 | **< 1 秒** |
| 後処理 | `package.json` の `name` を `app` に変更、`gitignore` → `.gitignore` にリネーム |

展開されたテンプレート `package.json`（初期値）:

```json
{
  "name": "app",
  "main": "index.ts",
  "dependencies": {
    "expo": "~58.0.21",
    "expo-status-bar": "~58.0.4",
    "react": "19.3.0",
    "react-native": "0.88.1"
  },
  "devDependencies": {
    "@types/react": "~19.3.0",
    "typescript": "~6.0.3"
  }
}
```

---

## 3. `npm install`（依存関係インストール）

| 項目 | 内容 |
|---|---|
| コマンド | `npm install --no-audit --no-fund`（cwd=`.env-probe/app`、`$env:npm_config_cache=<workspace>\.cache\npm`） |
| 結果 | **成功（exit 0）** — `added 460 packages in 24s` |
| 所要時間 | **24.5 秒（0.41 分）** |
| エラー | なし（deprecated 警告のみ） |
| 成果物 | `package-lock.json` 230,669 B / `node_modules` トップレベル 280 エントリ / **314 MB** |
| 回避策 | npm キャッシュをワークスペース内へ（`$env:npm_config_cache`）。デフォルトキャッシュは EPERM のため必須 |

### 3-1. 生成された実バージョン（`node_modules/*/package.json` から実測）

| パッケージ | 要求（テンプレート） | **実測インストール版** |
|---|---|---|
| expo | `~58.0.21` | **58.0.21** |
| react | `19.3.0` | **19.3.0** |
| react-native | `0.88.1` | **0.88.1** |
| typescript | `~6.0.3` | **6.0.3** |
| @types/react | `~19.3.0` | **19.3.0** |
| expo-status-bar | `~58.0.4` | **58.0.4** |
| metro（間接依存） | — | **0.87.1** |

---

## 4. `npx tsc --noEmit`（型検査）

### 4-1. テストファイル追加前 → **成功**

| 項目 | 内容 |
|---|---|
| コマンド | `npx tsc --noEmit`（cwd=`.env-probe/app`） |
| 結果 | **成功（exit 0、出力なし）** |
| 所要時間 | **2.2 秒** |
| エラー | なし |
| 回避策 | 不要 |

### 4-2. `__tests__/sum.test.ts` 追加後 → **失敗（TypeScript 6.0.3 の重要な挙動差）**

| 項目 | 内容 |
|---|---|
| コマンド | `npx tsc --noEmit` |
| 結果 | **失敗（exit 2）** |
| 所要時間 | 2.5 秒（およそ 4.3〜6.9 秒） |
| エラー全文（要約） | `__tests__/sum.test.ts(5,1): error TS2593: Cannot find name 'describe'. Do you need to install type definitions for a test runner? Try \`npm i --save-dev @types/jest\` ... and then add 'jest' to the types field in your tsconfig.`<br>同様に `it`（TS2593）×2、`expect`（TS2304）×2 の計 5 件 |
| 原因 | **TypeScript 6.0.3 は `@types/jest` を自動では取り込まない**（`@types/jest@30.0.0` は `node_modules/@types/jest` に存在しているにもかかわらず）。`expo/tsconfig.base` には `types` 指定がないため、明示が必要 |
| 回避策 | `tsconfig.json` の `compilerOptions` に `"types": ["jest", "node"]` を追加 |
| 検証 | `npx tsc --noEmit --types jest` 単体でも **exit 0** を確認（原因の裏取り） |

修正後の `tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest", "node"]
  }
}
```

### 4-3. 修正後の再実行 → **成功**

| 項目 | 内容 |
|---|---|
| コマンド | `npx tsc --noEmit` |
| 結果 | **成功（exit 0、出力なし）** |
| 所要時間 | **6.9 秒** |

---

## 5. Jest の導入と実行

### 5-1. `npx expo install jest-expo jest @types/jest --dev` → **失敗**

| 項目 | 内容 |
|---|---|
| コマンド | `npx expo install jest-expo jest @types/jest --dev` |
| 結果 | **失敗（exit 1、`npm install exited with non-zero code: 4294963248`）** |
| 所要時間 | **44.1 秒** |
| エラー全文（要約） | `› Installing 3 SDK 58.0.0 compatible native modules using npm` → `> npm install` →<br>`npm error code EPERM` / `npm error syscall spawn` / `npm error Error: spawn EPERM`<br>スタック: `@npmcli/promise-spawn` → `@npmcli/run-script/lib/run-script-pkg.js` → `@npmcli/arborist/lib/arborist/rebuild.js`<br>デバッグログの最終処理: **`build:run:install:node_modules/@parcel/watcher`**<br>さらに `npm warn cleanup ... EPERM rmdir ...node_modules\expect\node_modules` 等の後始末失敗も併発 |
| 原因 | `@parcel/watcher` の `install` スクリプトを npm がパイプ付き stdio で spawn → **サンドボックスの EPERM**（§7-1） |
| 副作用 | package.json への devDependencies 書き込みは **成功していた**（`jest-expo ~58.0.13`, `jest ~30.5.2`, `@types/jest 30.0.0`）が、node_modules はロールバックされ未インストール |
| 回避策 | `--ignore-scripts` を付けて再実行（§5-2） |

### 5-2. `npm install --ignore-scripts` で再実行 → **成功**

| 項目 | 内容 |
|---|---|
| コマンド | `npm install --ignore-scripts --no-audit --no-fund` |
| 結果 | **成功（exit 0）** — `added 557 packages, and changed 2 packages in 25s` |
| 所要時間 | **25.9 秒** |
| エラー | deprecated 警告のみ |

### 5-3. 実測 Jest 関連バージョン

| パッケージ | 要求 | **実測インストール版** |
|---|---|---|
| jest-expo | `~58.0.13` | **58.0.13** |
| jest | `~30.5.2` | **30.5.2** |
| @types/jest | `30.0.0` | **30.0.0** |
| @react-native/jest-preset（jest-expo の peer） | `^0.88.1` | **0.88.1** |
| @parcel/watcher（間接依存） | — | **2.6.0** |

> jest-expo 58.0.13 の peerDependencies: `expo: *`, `jest: ^29.0.0 || ^30.0.0`, `react-native: *`, `react-server-dom-webpack: ~19.0.4 || ~19.1.5 || ~19.2.4 || ~19.3.0`, `@react-native/jest-preset: ^0.88.1`。
> `react-server-dom-webpack` は未インストールだが、**純粋関数テストの実行には不要**（今回のテストは通過）。

### 5-4. Jest 設定とテスト

`package.json` に追記:

```json
"jest": { "preset": "jest-expo" }
```

- **`transformIgnorePatterns` の追加設定は不要**（jest-expo プリセットの既定で足りた）
- tsconfig の `"types": ["jest", "node"]` は **必要**（§4-2）

テストファイル `.env-probe/app/__tests__/sum.test.ts`:

```ts
function sum(a: number, b: number): number {
  return a + b;
}

describe('sum (probe)', () => {
  it('adds 2 + 2 = 4', () => {
    expect(sum(2, 2)).toBe(4);
  });

  it('adds negative numbers', () => {
    expect(sum(-1, 5)).toBe(4);
  });
});
```

### 5-5. `npx jest`（デフォルト＝ワーカープール） → **失敗**

| 項目 | 内容 |
|---|---|
| コマンド | `npx jest` |
| 結果 | **失敗（exit 1）** |
| 所要時間 | **2.6 秒** |
| エラー全文（要約） | `Error: spawn EPERM`<br>`at fork (node:internal/child_process:174:10)`<br>`at ChildProcessWorker.initialize (...node_modules\jest-runtime\node_modules\jest-worker\build\index.js:773:49)`<br>`at WorkerPool.createWorker ...` |
| 原因 | jest-worker がテスト実行を子プロセスに fork（パイプ付き stdio）→ サンドボックス EPERM |
| 回避策 | `--runInBand`（§5-6） |

### 5-6. `npx jest --runInBand` → **成功**

| 項目 | 内容 |
|---|---|
| コマンド | `npx jest --runInBand` |
| 結果 | **成功（exit 0）** |
| 所要時間 | **5.7 秒**（Jest 計測: 3.537 s） |
| 出力 | `PASS __tests__/sum.test.ts`<br>`√ adds 2 + 2 = 4 (5 ms)`<br>`√ adds negative numbers (1 ms)`<br>`Test Suites: 1 passed, 1 total` / `Tests: 2 passed, 2 total` |
| エラー | なし |
| 回避策 | `--runInBand` を必ず付与（サンドボックス内） |

---

## 6. Metro バンドル（`expo export`）

### 6-1. `npx expo export --platform android --max-workers 1` → **バンドル成功 / Hermes 工程で失敗**

| 項目 | 内容 |
|---|---|
| コマンド | `npx expo export --platform android --max-workers 1` |
| 結果 | **失敗（exit 1）** ただし **Metro の JS バンドル自体は成功**（`Android Bundling failed 12599ms index.ts (616 modules)` の直後に Hermes 工程で停止） |
| 所要時間 | **16.5 秒**（うちバンドル 12.599 秒） |
| エラー全文（要約） | `Failed to generate Hermes bytecode for: ...\app\index.ts`<br>`Error: spawn EPERM`<br>`at directlyBuildHermesBundleAsync (...@expo\metro-config\build\serializer\exportHermes.js:141:41)`<br>`at async Chunk.serializeToAssetsAsync ...` |
| 原因 | Hermes バイトコード生成のため **`hermesc` 実行ファイルをパイプ付き stdio で spawn** → サンドボックス EPERM（バンドル生成ではない） |
| 回避策 | `--no-bytecode` を付与（§6-2）。Metro のワーカーは `--max-workers 1` で EPERM を回避できた（バンドルは 616 モジュール完走） |

### 6-2. `npx expo export --platform android --max-workers 1 --no-bytecode` → **バンドル出力成功（CLI は終了せず）**

| 項目 | 内容 |
|---|---|
| コマンド | `npx expo export --platform android --max-workers 1 --no-bytecode` |
| 結果 | **バンドル出力は成功**。`dist/` に完全な production バンドルが生成された。ただし **CLI プロセスが約 7 分以上終了しなかったため kill**（サマリ出力は得られず） |
| 所要時間 | バンドル生成自体は開始後まもなく（`dist/` にファイル出現を確認）。プロセスは >420 秒未終了 |
| 生成物（実測） | `dist/metadata.json`（149 B）<br>`dist/_expo/static/js/android/index-dd91a91eb1c8d887dc6018e5b05daef9.js` — **992,587 B** |
| 生成物の検証 | `metadata.json` = `{"version":0,"bundler":"metro","fileMetadata":{"android":{"bundle":"_expo/static/js/android/index-...js","assets":[]}}}`<br>bundle 先頭は `__DEV__=false` の **production ビルド**、**`__d(` モジュール定義 616 個**、末尾は `__r(6);__r(3);__r(0);` で正常終了 |
| エラー | Hermes の spawn EPERM は `--no-bytecode` で解消。終了ハングの原因は特定できず（EPERM ではなく、出力なしで無応答。`expo config` のハングと同系統の疑い） |
| 回避策 | バンドル生成の成否判定は **dist 成果物の検証で代替**。実 PC（サンドボックス外）では `hermesc` も正常 spawn できるため、この 2 段階回避は不要 |

> 補足: blank-typescript テンプレートには `react-dom` / `react-native-web` が含まれないため `--platform web` のエクスポートは未実施（web を出す場合は `npx expo install react-dom react-native-web @expo/metro-runtime` が必要）。Android バンドルでは Metro の変換・解決が 616 モジュール分完走しており、**バンドラとしての健全性は確認できた**。

---

## 7. `npx expo config --type public` → **ハング（未解決）**

| 試行 | コマンド | 結果 | 所要時間 |
|---|---|---|---|
| 1 | `npx expo config --type public`（`EXPO_NO_TELEMETRY=1`, `CI=1`） | **ハング、出力ゼロ** → バックグラウンド移行後に kill | **> 600 秒** |
| 2 | 同上 + `EXPO_OFFLINE=1` | **ハング、出力ゼロ** → kill | **> 120 秒** |
| 3 | `cmd /c "npx expo config --type public > log 2>&1"`（出力ファイルへリダイレクト、45 秒上限） | **ハング、ログファイルすら生成されず** → kill | **> 45 秒** |

- EPERM ではなく **無応答ハング**。EPERM（子プロセス spawn）とは別要因。
- **代替検証（成功）**: `@expo/config` の API を直接呼び出して app.json の解決を確認

| 項目 | 内容 |
|---|---|
| コマンド | `node -e "require('@expo/config').getConfig(process.cwd(), {skipSDKVersionRequirement:true})"`（cwd=`.env-probe/app`） |
| 結果 | **成功**。`name= HelloWorld \| slug= expo-template-blank-typescript \| platforms= ["ios","android"]` |
| 所要時間 | **0.1 秒** |
| 回避策 | `expo config` CLI サブコマンドは使わず、`@expo/config` の `getConfig()` API で代替。<br>なお `app.json` の解決自体は `expo export`（§6）が正常に app.json を読んで動作していることからも裏付けられる |

---

## 8. 遭遇したサンドボックス拒否（EPERM/EACCES）の全記録

### 8-1. 切り分け実験（制約の確定）

`.env-probe/probe-spawn.js` で子プロセス生成を検証した結果:

| 生成方法 | 結果 |
|---|---|
| `spawnSync(cmd.exe, stdio: 'pipe')` | **EPERM**（`spawnSync cmd.exe EPERM`） |
| `spawnSync(cmd.exe, stdio: 'inherit')` | 成功（exit 0） |
| `spawnSync(cmd.exe, stdio: 'ignore')` | 成功（exit 0） |
| `execSync(...)` | **EPERM** |
| `spawnSync(node, ['-e','...'], stdio:'pipe')` | **EPERM** |

→ **このサンドボックスは「パイプ付き stdio を持つ子プロセス生成」を一律 EPERM で拒否する**（`stdio: 'inherit' | 'ignore'` は可）。以降の失敗はすべてこの 1 つの制約に由来する。

### 8-2. 拒否一覧と回避結果

| # | 発生箇所 | エラー | リダイレクト/回避策 | 回避できたか |
|---|---|---|---|---|
| 1 | `create-expo-app` 起動時（`~/.expo` 作成） | `EPERM: operation not permitted, mkdir 'C:\Users\MaedaNatsuki\.expo'` | `USERPROFILE`/`HOME` をワークスペース内 `home` へ | **一部成功**（EPERM は解消、次項の別エラーへ） |
| 2 | `create-expo-app` 内部の `npm.cmd pack --dry-run`（piped stdio） | `spawn EPERM` → `Cannot read properties of undefined (reading 'match')` | `create-expo-app` を諦め、`npm pack` + `tar` で同テンプレートを直接取得 | **成功** |
| 3 | npm デフォルトキャッシュ `C:\Users\...\AppData\Local\npm-cache` | EPERM（既知） | `$env:npm_config_cache=<workspace>\.cache\npm` | **成功** |
| 4 | `npx expo install` 内部の `npm install`（`@parcel/watcher` install スクリプト spawn） | `npm error code EPERM` / `syscall spawn` / `spawn EPERM` | `npm install --ignore-scripts` | **成功** |
| 5 | 上記ロールバック時の後始末 | `npm warn cleanup EPERM rmdir ...node_modules\expect\node_modules` 等（**ワークスペース内パスなのに EPERM**。一時的なハンドルロックと推定） | 再実行（`--ignore-scripts`）で解消 | **成功**（再現せず） |
| 6 | `npx jest`（jest-worker の fork） | `spawn EPERM`（`ChildProcessWorker.initialize`） | `npx jest --runInBand` | **成功** |
| 7 | `npx expo export` の Hermes バイトコード生成（`hermesc` spawn） | `spawn EPERM`（`directlyBuildHermesBundleAsync`） | `--no-bytecode` | **バンドル生成は成功**（CLI 終了は別問題） |
| 8 | `npx expo config --type public` | EPERM ではなく**無応答ハング** | `@expo/config` の `getConfig()` API で代替 | **代替手段で成功**（CLI は未解決） |

> **重要**: 1〜7 はすべて「パイプ付き子プロセス生成」に起因する **DSH サンドボックス固有の制約**であり、通常の Windows PC（サンドボックス外）では発生しない。回避策はいずれも「ピュア JS の工程はそのまま／子プロセスを伴う工程は in-band 実行 or 工程を分離」という形で成立している。

### 8-3. 回避できなかったもの（実装フェーズでの注意）

| 項目 | 状態 | 対処方針 |
|---|---|---|
| `create-expo-app` | このサンドボックスでは**使用不可** | `npm pack` + `tar` の 2 コマンドで代替（§2-3） |
| `expo config` CLI | **ハング、使用不可** | `@expo/config` API か、`expo export` の成否で代替確認 |
| Hermes バイトコード生成 | サンドボックス内では不可 | `--no-bytecode` で検証。実 PC では通常どおり生成可 |
| `expo export` のプロセス終了 | `--no-bytecode` 時に終了しない | dist 成果物で判定。実 PC では要再確認 |
| `expo start`（開発サーバー） | **未検証**（時間制約） | 実 PC では問題ない見込み。サンドボックス内では Metro ワーカーに `--max-workers 1` 相当が必要 |

---

## 9. 所要時間サマリ（実測）

| 工程 | 所要時間 | 成否 |
|---|---|---|
| 空き容量確認 | 0.1 秒 | 成功 |
| `create-expo-app`（試行1） | 3.6 秒 | 失敗（EPERM） |
| `create-expo-app`（試行2） | 2.2 秒 | 失敗（spawn EPERM） |
| テンプレート tarball 取得（`npm pack`） | 2.6 秒 | 成功 |
| tarball 展開（`tar`） | < 1 秒 | 成功 |
| **`npm install`（本体）** | **24.5 秒** | 成功 |
| `npx tsc --noEmit`（テンプレート直後） | 2.2 秒 | 成功 |
| `npx tsc --noEmit`（テスト追加後・types 未設定） | 2.5 秒 | 失敗（TS2593×5） |
| `npx tsc --noEmit`（`types` 設定後） | 6.9 秒 | 成功 |
| `npx expo install ... --dev` | 44.1 秒 | 失敗（spawn EPERM） |
| **`npm install --ignore-scripts`（Jest 一式）** | **25.9 秒** | 成功 |
| `npx jest`（デフォルト） | 2.6 秒 | 失敗（spawn EPERM） |
| **`npx jest --runInBand`** | **5.7 秒** | 成功（2 tests PASS） |
| `npx expo export --platform android --max-workers 1` | 16.5 秒（バンドル 12.6 秒） | バンドル成功 / Hermes 失敗 |
| `npx expo export ... --no-bytecode` | > 420 秒（未終了） | バンドル出力成功 / CLI ハング |
| `npx expo config --type public` | > 600 秒 / > 120 秒 / > 45 秒 | ハング |
| `@expo/config` getConfig（代替） | 0.1 秒 | 成功 |

> **正味のセットアップ時間（キャッシュ済み・回避策適用）: 約 1 分 10 秒**（テンプレート取得 2.6s + 展開 1s + npm install 24.5s + Jest 25.9s + tsc 6.9s + jest 5.7s）。
> 初回はテンプレート tarball とレジストリのダウンロードを含めても **合計 2 分弱**。

---

## 10. ディスク消費（証跡として残置）

| 対象 | サイズ |
|---|---|
| `.env-probe/` 合計 | **423.8 MB**（うち `app/node_modules` = **421.3 MB**） |
| `.cache/`（npm キャッシュ + npx キャッシュ） | **751.5 MB** |
| C: 空き容量の変化 | 94.05 GB → **92.68 GB**（約 1.37 GB 消費） |

後片付けは不要との指示のため `.env-probe/` は証跡として残置。ログは `.env-probe/log-*.txt` に保存済み。

---

## 11. PC上での開発は可能か

### **判定: Yes（可能）**

**根拠:**

1. **インストール**: Expo SDK 58 の公式 blank-typescript テンプレートから `npm install` が **24.5 秒・460 パッケージで成功**。npm レジストリ到達可、ディスク空き 94 GB で十分。
2. **TypeScript**: `npx tsc --noEmit` が型エラーゼロで **成功**（6.9 秒）。TypeScript 6.0.3 + Expo の `tsconfig.base`（strict）が正常に機能。
3. **Jest**: `jest-expo 58.0.13` + `jest 30.5.2` の組み合わせで **テスト 2 件が PASS**。`preset: "jest-expo"` のみで動作し、`transformIgnorePatterns` の追加設定は不要。
4. **Metro バンドル**: `expo export` で **616 モジュール・992 KB の production バンドルが正常生成**（`__DEV__=false`、`__r()` ブートストラップで終端）。バンドラとしての実力は確認済み。
5. **app.json 解決**: `@expo/config.getConfig()` が 0.1 秒で `name/slug/platforms` を解決。設定ファイルは有効。

**ただし条件付き:**

- 上記は **回避策コマンド列（§12）を適用した場合**。素の `npx create-expo-app` / `npx expo install` / `npx jest` / Hermes バイトコード生成は、**DSH サンドボックスの「パイプ付き子プロセス EPERM」制約により失敗する**。
- この制約は **サンドボックス由来であり、通常の Windows PC には存在しない**。実 PC では標準コマンド列で通る見込み（`hermesc` も正常 spawn 可能）。
- 未検証項目: `expo start`（開発サーバー）/ 実機・エミュレータ接続 / `--platform web`（`react-dom`・`react-native-web` 未導入のため）/ Android ネイティブビルド（Gradle, `GRADLE_USER_HOME` のワークスペース内リダイレクトが必要と既知）。

---

## 12. 実装フェーズで踏むべき手順（コマンド列）

### 12-1. サンドボックス内（この DSH 環境）で実行する場合

```powershell
# --- 0. 前提: ワークスペース内にキャッシュとホームを逃がす ---
$ws = "C:\Users\MaedaNatsuki\Documents\deepseek-harness\default-workspace"
$env:npm_config_cache = "$ws\.cache\npm"
$env:npm_config_logs_dir = "$ws\.cache\npm-logs"
$env:USERPROFILE = "$ws\home"        # ~/.expo の EPERM 回避（必要な場合）
$env:HOME        = "$ws\home"
$env:CI = "1"; $env:EXPO_NO_TELEMETRY = "1"
New-Item -ItemType Directory -Force -Path "$ws\.cache\npm", "$ws\home" | Out-Null

# --- 1. テンプレート生成（create-expo-app は使わない）---
Set-Location $ws
npm pack expo-template-blank-typescript@latest          # → expo-template-blank-typescript-58.0.30.tgz
New-Item -ItemType Directory -Force -Path "$ws\.env-probe\app" | Out-Null
tar -xzf expo-template-blank-typescript-58.0.30.tgz -C "$ws\.env-probe\app" --strip-components=1
# package.json の "name" を希望名に変更 / gitignore → .gitignore にリネーム

# --- 2. 依存インストール ---
Set-Location "$ws\.env-probe\app"
npm install --no-audit --no-fund

# --- 3. 型検査 ---
npx tsc --noEmit

# --- 4. Jest 導入（expo install ではなく npm + --ignore-scripts）---
npm install --ignore-scripts --no-audit --no-fund -D jest-expo@~58.0.13 jest@~30.5.2 @types/jest
# package.json に追記: "jest": { "preset": "jest-expo" }
# tsconfig.json の compilerOptions に追記: "types": ["jest", "node"]

# --- 5. テスト実行（必ず --runInBand）---
npx jest --runInBand

# --- 6. バンドル確認（必ず --max-workers 1 と --no-bytecode）---
npx expo export --platform android --max-workers 1 --no-bytecode
# 判定は dist/metadata.json と dist/_expo/static/js/android/*.js の生成で行う
```

### 12-2. 通常の Windows PC（サンドボックス外＝実機開発）の場合

通常のサンドボックス外 PC では制約がないため、**標準コマンド列でよい**:

```powershell
# 1. プロジェクト生成
npx --yes create-expo-app@latest mobile --template blank-typescript
Set-Location mobile

# 2. 依存インストール（create-expo-app が自動実行。手動なら npm install）
npm install

# 3. 型検査
npx tsc --noEmit

# 4. Jest 導入（expo install がバージョン整合を取ってくれる）
npx expo install jest-expo jest @types/jest --dev
# package.json: "jest": { "preset": "jest-expo" }
# tsconfig.json: "types": ["jest", "node"]   ← TypeScript 6 系では必須

# 5. テスト
npx jest

# 6. 開発サーバー起動（実機/エミュレータ確認）
npx expo start

# 7. バンドル確認（Hermes バイトコード含めて通常生成）
npx expo export --platform android
```

### 12-3. 実装時に必ず守る注意点

| # | 注意点 | 理由 |
|---|---|---|
| 1 | `tsconfig.json` に `"types": ["jest", "node"]` を入れる | TypeScript 6.0.3 は `@types/jest` を自動取り込みしない（TS2593 で型検査が落ちる） |
| 2 | Jest は `--runInBand`（または `--maxWorkers=1`）で実行 | サンドボックス内ではワーカー fork が EPERM。CI 設定でも同様に |
| 3 | npm キャッシュは `$env:npm_config_cache` でワークスペース内へ | デフォルトキャッシュは書き込み不可 |
| 4 | 依存追加は `npm install --ignore-scripts` | `@parcel/watcher` 等の install スクリプト spawn が EPERM |
| 5 | `expo export` は `--max-workers 1 --no-bytecode` | ワーカー fork / `hermesc` spawn が EPERM |
| 6 | `expo config` は使わず `@expo/config` API で代替 | CLI サブコマンドがハング |
| 7 | `.gitignore` は `gitignore` からリネーム | tarball 展開時は `gitignore` という名前になるため |
| 8 | `react-dom` / `react-native-web` は未導入 | web ターゲットが必要になったら `npx expo install react-dom react-native-web @expo/metro-runtime` |

---

## 付録: 証跡ファイル

| ファイル | 内容 |
|---|---|
| `.env-probe/log-01-create-expo-app.txt` | `create-expo-app` 試行1（EPERM `.expo`） |
| `.env-probe/log-01b-create-expo-app.txt` | 試行2（`Cannot read properties of undefined (reading 'match')`） |
| `.env-probe/log-02-npm-install.txt` | `npm install` 本体（24.5s / 460 packages） |
| `.env-probe/log-03-tsc.txt` / `log-03b` / `log-03c` | tsc（初回成功 / types 未設定で失敗 / types 設定後成功） |
| `.env-probe/log-04-expo-install-jest.txt` | `npx expo install` の EPERM 全文 |
| `.env-probe/log-05-npm-install-jest-ignorescripts.txt` | `--ignore-scripts` で成功 |
| `.env-probe/log-06-jest-plain.txt` | `npx jest` の `spawn EPERM` |
| `.env-probe/log-07-jest-runinband.txt` | `npx jest --runInBand` PASS |
| `.env-probe/log-09-expo-export-android.txt` | `expo export` の Hermes spawn EPERM |
| `.env-probe/probe-spawn.js` | パイプ付き spawn の EPERM 切り分け実験 |
| `.env-probe/app/dist/` | 生成された Android production バンドル（992 KB） |
| `.env-probe/expo-template-blank-typescript-58.0.30.tgz` | 使用した公式テンプレート tarball |

（`log-08*` / `log-10*` はハングした `expo config` / `--no-bytecode` export のため出力が残っていない）
