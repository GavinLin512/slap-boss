import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

// demo/ 是早期的原型，.claude/、.agents/ 是 AI 工具的設定，都不屬於這個網站
const notTheApp = ["demo/**", ".claude/**", ".agents/**", "skills-lock.json"];

export default defineConfig({
	plugins: [cloudflare()],
	// 遊戲前端的程式碼維持原本的寫法，不自動重排
	fmt: {
		useTabs: true,
		ignorePatterns: [...notTheApp, "src/client/**", "index.html", "README.md"],
	},
	lint: {
		ignorePatterns: notTheApp,
		options: { typeAware: true, typeCheck: true },
	},
});
