# MoonTV Cloudflare 部署指南

## 已完成的部分

- ✅ 项目已使用 `@cloudflare/next-on-pages` 构建
- ✅ 构建输出在 `.vercel/output/`
- ✅ 已创建 `wrangler.toml` 配置文件

## 需要完成的步骤

### 1. 创建 D1 数据库

1. 登录 Cloudflare 控制台: https://dash.cloudflare.com
2. 进入 **存储和数据库 -> D1 SQL 数据库**
3. 点击 **创建数据库**
4. 数据库名称: `moon-tv-db`
5. 记录生成的数据库 ID (UUID 格式)

### 2. 初始化数据库表结构

在 D1 数据库的 **Explore Data** 页面，运行以下 SQL:

```sql
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS play_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  cover TEXT NOT NULL,
  year TEXT NOT NULL,
  index_episode INTEGER NOT NULL,
  total_episodes INTEGER NOT NULL,
  play_time INTEGER NOT NULL,
  total_time INTEGER NOT NULL,
  save_time INTEGER NOT NULL,
  search_title TEXT,
  UNIQUE(username, key)
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  cover TEXT NOT NULL,
  year TEXT NOT NULL,
  total_episodes INTEGER NOT NULL,
  save_time INTEGER NOT NULL,
  UNIQUE(username, key)
);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  keyword TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(username, keyword)
);

CREATE TABLE IF NOT EXISTS admin_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  config TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS skip_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  source TEXT NOT NULL,
  id_video TEXT NOT NULL,
  enable INTEGER NOT NULL DEFAULT 0,
  intro_time INTEGER NOT NULL DEFAULT 0,
  outro_time INTEGER NOT NULL DEFAULT 0,
  UNIQUE(username, source, id_video)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_play_records_username ON play_records(username);
CREATE INDEX IF NOT EXISTS idx_favorites_username ON favorites(username);
CREATE INDEX IF NOT EXISTS idx_search_history_username ON search_history(username);
CREATE INDEX IF NOT EXISTS idx_skip_configs_username_source_id ON skip_configs(username, source, id_video);
```

### 3. 更新 wrangler.toml

将第 28 行的 `database_id = ""` 替换为实际的 D1 数据库 ID。

### 4. 配置环境变量

在 Cloudflare Pages 控制台:

1. 进入 **Pages -> moon -> Settings -> Environment Variables**
2. 添加以下变量（设置为 Secret）:

| 变量名                            | 值                              |
| --------------------------------- | ------------------------------- |
| PASSWORD                          | your_password                   |
| USERNAME                          | admin                           |
| NEXT_PUBLIC_STORAGE_TYPE          | d1                              |
| SITE_NAME                         | MoonTV                          |
| ANNOUNCEMENT                      | 本网站仅提供影视信息搜索服务... |
| NEXT_PUBLIC_ENABLE_REGISTER       | false                           |
| NEXT_PUBLIC_DISABLE_YELLOW_FILTER | false                           |
| NEXT_PUBLIC_SEARCH_MAX_PAGE       | 5                               |

### 5. 部署

#### 方法 A: 使用 Wrangler CLI

```bash
# 登录 Cloudflare
wrangler login

# 部署到 Pages
wrangler pages deploy .vercel/output/static --project-name=moon --branch=main
```

#### 方法 B: 手动上传

1. 进入 Cloudflare Pages 控制台
2. 选择 **moon** 项目
3. 进入 **部署 -> 手动部署**
4. 上传 `.vercel/output` 目录

### 6. 配置自定义域名（可选）

1. 进入 Pages 项目设置
2. 添加自定义域名: `moon.your-domain.com`
3. 配置 DNS 记录指向 Cloudflare

---

## 兼容性说明

本项目使用 `nodejs_compat` 兼容性标志，支持:

- Cloudflare D1 数据库
- Edge Runtime API
- crypto.subtle (用于密码签名)
- fetch API

不支持:

- 原生 Redis 连接 (如需使用请改用 Upstash Redis)

---

## 故障排除

### 问题: 部署后页面显示空白

**解决**: 检查环境变量是否正确配置，特别是 `PASSWORD` 和 `NEXT_PUBLIC_STORAGE_TYPE`

### 问题: D1 数据库连接失败

**解决**: 确认 wrangler.toml 中的 `database_id` 已正确填写

### 问题: 搜索功能不工作

**解决**: 检查 config.json 中的 API 地址是否可访问
