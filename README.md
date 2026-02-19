# Band Recommender

基于 Vue 3 + Fastify + SQLite 的乐队推荐系统。

## SPEC

By me through openspec.

## CODE

By glm-4.7, kimi k2.5 through iflow.

## DATA

Generated from glm-4.6v-flash 9b local vllm deployment.

## 项目结构

```
recommender/
├── backend/          # Fastify + SQLite 后端
│   ├── src/          # 源代码
│   ├── data/         # 数据库文件
│   └── cache/        # 缓存数据
├── frontend/         # Vue 3 + Vite 前端
│   ├── src/          # 源代码
│   └── public/       # 静态资源
└── openspec/         # OpenSpec 规范文档
```

## 快速开始

### 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd backend && npm install

# 安装前端依赖
cd ../frontend && npm install
```

### 开发模式

**静态模式（推荐）**：
```bash
cd frontend
npm run dev
```
前端将在 `http://localhost:5173` 启动，使用预生成的静态数据。

**API 模式**：
```bash
# 终端 1: 启动后端
cd backend
npm run dev

# 终端 2: 启动前端（API 模式）
cd frontend
# 创建 .env 文件并设置 VITE_API_MODE=true
npm run dev
```

### 构建部署

```bash
# 构建生产版本（包含数据）
cd frontend
npm run build-with-data

# 部署 dist/ 目录到静态托管服务
```

## 技术栈

- **前端**: Vue 3, TypeScript, Vite, Bootstrap 5
- **后端**: Node.js, Fastify, TypeScript, SQLite
- **数据**: LLM 生成的乐队数据

## 数据管理

后端提供完整的数据管理 CLI：

```bash
cd backend

# 导出数据到前端
npm run export-data

# 从 LLM 导入新乐队
npm run import-data

# 生成推荐数据
npm run generate-recommendations

# 完整更新流程
npm run full-update
```

## 许可证

ISC