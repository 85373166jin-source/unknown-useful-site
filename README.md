# unknown-useful-site

某不知名有用的网站。一个包含公开课程页面、购买/课程密码解锁、付款截图审核、管理员后台，以及基于 Cloudflare Workers + D1 + R2 的 API 服务。

## 仓库结构

- `apps/web` — Vite + React 前端，同时构建公开站点和 `/admin/` 站长后台。
- `apps/api` — Hono Worker API，提供认证、课程目录、权益、订单、进度和管理员接口。
- `packages/contracts` — 前后端共享的课程目录与 Zod schema。
- `docs/DEPLOYMENT.md` — GitHub Pages、Workers、D1、R2 的部署流程。
- `docs/OPERATIONS.md` — 日常运营操作说明。
- `tests/e2e` — Playwright 端到端测试与本地服务器/数据夹具。

## 本地开发

```powershell
npm install
npm run dev
```

默认 API 运行在 `http://127.0.0.1:8787`，公开站点运行在 `http://127.0.0.1:5173`。

初始化本地 D1 并写入课程与管理员种子数据：

```powershell
npm run db:migrate:local --workspace @site/api
npm run db:seed:local --workspace @site/api
```

需要先准备本地环境变量。可以复制 `apps/web/.env.example` 中的前端变量，并按部署文档为 API Worker 配置 `SESSION_PEPPER`、`CONTACT_HMAC_SECRET`、`ALLOWED_ORIGINS` 以及管理员/课程密码哈希等绑定。生产密钥只保存在 Cloudflare 后台或 git-ignored 的 `.dev.vars` 中，不要提交。

## 测试

```powershell
npm run test
npm run typecheck
npm run build
npm run test:e2e
```

- `npm run test` 运行各 workspace 的 Vitest 单元/集成测试（API、前端、共享契约）。
- `npm run typecheck` 和 `npm run build` 做 TypeScript 与生产构建校验。
- `npm run test:e2e` 使用 Playwright 启动本地 `wrangler dev --local` 与 Vite，运行 `tests/e2e` 下的真实端到端旅程。

### Playwright 浏览器

E2E 默认使用系统已安装的 Microsoft Edge（Playwright `channel: 'msedge'`），避免在受限环境中下载 Chromium。若本机没有 Edge，可在 `playwright.config.ts` 中改用已安装的 Chrome channel，或先运行 `npx playwright install chromium`。

在无网络下载 Playwright npm 包的环境中，测试脚本按 `node_modules/playwright/cli.js test` 运行；Playwright 1.62+ 的 `playwright` 包内置 test runner。正常联网环境直接安装 Playwright 测试依赖即可。

## 安全边界

- 未登录访客可以浏览公开页面，但账号页、课程学习页和付款申请页要求登录。
- 一个账号同时只保留一个有效会话，新登录会替换旧会话。
- 管理员路由同时在 API 中间件和前端导航层做角色限制。
- 购买合集审批通过后会授予 `super` 与 `anbu` 两个课程权益。
- 付款审批通过后，确认收入会立即反映到管理员仪表盘和收入报表。
- API 不返回密码哈希、明文密码、明文联系方式或付款截图地址；审计日志会脱敏这些字段。

详见 `docs/DEPLOYMENT.md` 与 `docs/OPERATIONS.md`。
