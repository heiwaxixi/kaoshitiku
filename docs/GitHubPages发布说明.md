# GitHub Pages 发布说明

<span style="color:#0f8f69;font-weight:700">新增：</span>当前项目已配置为 GitHub Pages 静态发布方式，目标仓库为 `heiwaxixi/kaoshitiku`。

<span style="color:#1f6fe5;font-weight:700">改动：</span>GitHub Pages 访问路径按项目站点处理，最终地址通常是：

```text
https://heiwaxixi.github.io/kaoshitiku/
```

<span style="color:#e11d48;font-weight:700">改动：</span>已取消访问码入口，公网地址打开后直接进入题库目录。

<span style="color:#2563eb;font-weight:700">新增：</span>GitHub 启动接口为 `https://heiwaxixi.github.io/kaoshitiku/start.html`，该页面会自动跳转到题库目录，并提供手动进入按钮作为兜底。

<span style="color:#0f8f69;font-weight:700">新增：</span>发布工作流文件位于 `.github/workflows/pages.yml`，推送到 `main` 分支后会自动构建并部署 `dist`。

<span style="color:#0f8f69;font-weight:700">新增：</span>本机可双击 `发布到GitHubPages.bat`，脚本会检查 GitHub 登录、构建项目、创建或绑定公开仓库并推送。

<span style="color:#c2413b;font-weight:700">注意：</span>免费 GitHub Pages 对公开仓库最合适，当前内置题库会随网页一起公开。不要在仓库中放入不希望公开的资料。

<span style="color:#b7791f;font-weight:700">首次发布：</span>如果 GitHub 没有自动启用 Pages，请进入仓库 `Settings > Pages`，把 `Source` 设置为 `GitHub Actions`。
