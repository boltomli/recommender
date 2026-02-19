# Band Recommender Frontend

基于 Vue 3 + TypeScript + Vite 的乐队推荐系统前端应用。

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript
- **Vite** - 下一代前端构建工具
- **Bootstrap 5** - UI 框架
- **Vue Router** - 路由管理
- **Axios** - HTTP 客户端

## 安装依赖

```bash
npm install
```

## 运行模式

### 静态模式（默认，推荐）

静态模式不需要后端服务器运行，所有数据预生成在 JSON 文件中。适用于生产部署和离线使用。

```bash
npm run dev
```

应用将在 `http://localhost:5173` 启动。

### API 模式

API 模式需要后端服务器运行，通过 HTTP API 获取数据。适用于开发测试和实时数据更新。

1. 启动后端服务器（在 `backend/` 目录）：
   ```bash
   npm run dev
   ```

2. 创建 `.env` 文件配置环境变量：
   ```env
   VITE_API_MODE=true
   VITE_API_URL=http://localhost:3001
   ```

3. 启动前端开发服务器：
   ```bash
   npm run dev
   ```

## 构建

### 标准构建

构建生产版本（不包含数据文件）：

```bash
npm run build
```

### 完整构建（包含数据，推荐）

构建生产版本并从后端导出数据：

```bash
npm run build-with-data
```

此命令会：
1. 从后端数据库导出数据到 `public/data/` 目录
2. 构建前端应用

## 预览生产构建

```bash
npm run preview
```

## 部署

### 静态托管部署（推荐）

前端可以部署到任何静态托管服务，如：
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

部署步骤：
1. 运行 `npm run build-with-data` 生成包含数据的构建
2. 将 `dist/` 目录上传到静态托管服务

### 传统服务器部署

可以使用任何 Web 服务器托管 `dist/` 目录，例如：
- Nginx
- Apache
- Express (使用 `serve-static`)

## 功能特性

- 🎸 **流派选择** - 选择喜欢的音乐流派
- 🤖 **智能推荐** - 基于 LLM 的个性化乐队推荐
- 📊 **乐队对比** - 对比不同乐队的特点
- 🎨 **响应式设计** - 支持桌面和移动设备
- 📦 **静态模式** - 支持离线使用和静态托管
- 🔄 **双模式** - 支持静态模式和 API 模式切换

## 项目结构

```
frontend/
├── src/
│   ├── api.ts                      # API 客户端（支持静态和 API 模式）
│   ├── App.vue                     # 根组件
│   ├── main.ts                     # 应用入口
│   ├── style.css                   # 全局样式
│   ├── assets/                     # 静态资源
│   └── components/
│       ├── BandCard.vue           # 乐队卡片
│       ├── BandComparison.vue     # 乐队对比
│       ├── GenreSelection.vue     # 流派选择
│       └── Recommendations.vue    # 推荐列表
├── public/
│   └── data/                       # 静态数据文件（构建时生成）
│       ├── genres.json
│       ├── bands.json
│       └── recommendations.json
└── dist/                          # 构建输出目录
```

## 环境变量

创建 `.env` 文件配置环境变量（参考 `.env.example`）：

```env
# 运行模式：true=API模式，false=静态模式（默认）
VITE_API_MODE=false

# API 地址（仅在 API 模式下使用）
VITE_API_URL=http://localhost:3001
```

## 开发工具

推荐使用 VS Code 并安装以下扩展：
- Volar (Vue Language Features)
- TypeScript Vue Plugin (Volar)

## 浏览器支持

- Chrome (最新版)
- Firefox (最新版)
- Safari (最新版)
- Edge (最新版)

## 数据刷新

要更新静态数据，需要在后端运行数据导出命令：

```bash
cd backend
npm run export-data
```

或使用完整构建命令：

```bash
cd frontend
npm run build-with-data
```
