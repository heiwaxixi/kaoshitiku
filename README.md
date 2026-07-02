<span style="color:#0f8f69;font-weight:700">【新增】</span> # 考试 AI 题库与错题教练

<span style="color:#0f8f69;font-weight:700">【新增】</span> 本项目是一个面向“质量考试题库-辽宁、新疆土建题库汇总”的静态练习 App，包含题库目录、答题练习、显示答案、错题队列、本地 AI 教练、学习画像和今日计划。

<span style="color:#0f8f69;font-weight:700">【新增】</span> 当前版本不接入任何付费 AI API，错题教练使用本地规则生成诊断建议，因此不会产生模型调用费用。

<span style="color:#7c3aed;font-weight:700">【改动-内置题库】</span> 默认只保留 1 个内置题库：`质量考试题库-辽宁、新疆土建题库汇总`，共 1564 道题，包含单选、多选、判断、简答。

<span style="color:#7c3aed;font-weight:700">【新增-GitHub Pages】</span> 目标仓库：`heiwaxixi/kaoshitiku`。

<span style="color:#7c3aed;font-weight:700">【新增-GitHub Pages】</span> 发布后访问地址通常为：

```text
https://heiwaxixi.github.io/kaoshitiku/
```

<span style="color:#e11d48;font-weight:700">【改动-直接进入】</span> 已取消访问码入口，打开 GitHub Pages 地址后直接进入题库目录。

<span style="color:#2563eb;font-weight:700">【新增-GitHub启动接口】</span> 公网启动接口：`https://heiwaxixi.github.io/kaoshitiku/start.html`；本地可双击 `启动GitHub版.bat` 或 `打开考试AI题库-GitHub网页.url` 打开。

## <span style="color:#0f8f69;font-weight:700">【新增】</span> 本地运行

```powershell
npm install
npm run dev
```

<span style="color:#0f8f69;font-weight:700">【改动】</span> 本地固定端口：`http://127.0.0.1:4173`

## <span style="color:#2563eb;font-weight:700">【新增】</span> GitHub Pages 发布

<span style="color:#2563eb;font-weight:700">【新增】</span> 已提供官方 GitHub Actions 工作流：`.github/workflows/pages.yml`。

<span style="color:#2563eb;font-weight:700">【新增】</span> 推送到 `main` 分支后，GitHub Actions 会执行：

```text
npm ci
npm run build:pages
actions/upload-pages-artifact
actions/deploy-pages
```

<span style="color:#2563eb;font-weight:700">【新增】</span> 如果本机已登录 GitHub CLI，也可以双击：

```text
发布到GitHubPages.bat
```

<span style="color:#c2413b;font-weight:700">【注意】</span> 免费 GitHub Pages 适合公开静态网页。当前内置题库数据会随前端源码和网页一起公开。

## <span style="color:#0f8f69;font-weight:700">【新增】</span> 主要目录

- `src/data/qualityQuestions.ts`：内置质量土建题库数据。
- `src/data/questions.ts`：题型、科目、难度等类型定义。
- `src/lib/coach.ts`：本地错题教练诊断规则。
- `src/lib/importParser.ts`：TXT/CSV/XLSX 导入解析器。
- `src/lib/xlsxReader.ts`：浏览器端 XLSX 读取工具。
- `src/App.tsx`：题库目录、练习页、导入、答题流程和状态管理。
- `src/styles.css`：响应式界面样式。
- `public/manifest.webmanifest`：PWA 安装信息。
- `public/service-worker.js`：PWA 缓存脚本。
- `public/start.html`：GitHub Pages 公网启动接口，打开后自动进入题库目录。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署工作流。

## <span style="color:#2563eb;font-weight:700">【新增】</span> 导入格式

<span style="color:#2563eb;font-weight:700">【改动】</span> Excel 已适配电网质量土建模板：识别 `题型、试题正文、试题选项、试题答案、答案解析、依据出处` 等列。

<span style="color:#2563eb;font-weight:700">【改动】</span> 简答题支持无选项导入，界面显示题干、答题空白区、参考答案和解析。

<span style="color:#2563eb;font-weight:700">【改动】</span> 选项解析兼容 `A.xxx$;$B.xxx`、`B地面型`、`B.球形C.圆形` 等不规范格式。
