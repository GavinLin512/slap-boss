import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "beatboss",
		compatibilityDate: "2026-11-23",
		entrypoint,
		observability: { enabled: true },
		env: {
			// 第一次 cf deploy 時會自動在你的帳號建立這個資料庫；資料表由 Worker 自己建立。
			// 部署後用 `npx cf d1 list` 查 uuid，填成 { name: "beatboss-db", id: "<uuid>" }（見 README 部署第 5 步）
			DB: bindings.d1({ name: "beatboss-db" }),
		},
	},
});
