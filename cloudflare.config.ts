import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "beatboss",
		compatibilityDate: "2026-11-23",
		entrypoint,
		observability: { enabled: true },
		env: {
			// 資料庫在第一次部署時自動建立，ID 固定在這裡，之後每次部署都接同一個；資料表由 Worker 自己建立
			DB: bindings.d1({ name: "beatboss-db", id: "83e56ca7-7ebc-43a4-b826-d2e9cbe00b45" }),
		},
	},
});
