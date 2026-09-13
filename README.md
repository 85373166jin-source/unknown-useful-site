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

> **注意：** `npm run test:e2e` 会删除 `apps/api/.wrangler/state` 下的本地 D1 和 R2 状态，并重新应用迁移与 E2E 种子数据。不要在运行 E2E 前依赖本地 `.wrangler` 中手工写入的数据。

### Playwright 浏览器

E2E 默认使用系统已安装的 Microsoft Edge。可以通过 `PLAYWRIGHT_CHANNEL` 覆盖：

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"     # 使用已安装的系统 Chrome
$env:PLAYWRIGHT_CHANNEL = "msedge"     # 使用已安装的系统 Edge（默认）
npm run test:e2e
```

在 Linux/CI 上没有系统 Edge/Chrome 时，先安装 Playwright 自带的 Chromium，然后使用 chromium channel：

```bash
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

`playwright` 已在根 `package.json` 与 `package-lock.json` 中声明，`npm install` 后即可通过 `npx playwright` 调用。

## 安全边界

- 未登录访客可以浏览公开页面，但账号页、课程学习页和付款申请页要求登录。
- 一个账号同时只保留一个有效会话，新登录会替换旧会话。
- 管理员路由同时在 API 中间件和前端导航层做角色限制。
- 购买合集审批通过后会授予 `super` 与 `anbu` 两个课程权益。
- 付款审批通过后，确认收入会立即反映到管理员仪表盘和收入报表。
- API 不返回密码哈希、明文密码、明文联系方式或付款截图地址；审计日志会脱敏这些字段。

详见 `docs/DEPLOYMENT.md` 与 `docs/OPERATIONS.md`。
