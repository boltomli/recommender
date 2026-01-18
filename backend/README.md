# Band Recommender Backend

基于 Fastify 和 SQLite 的乐队推荐系统后端服务。

## 技术栈

- **Node.js** - 运行时环境
- **Fastify** - 高性能 Web 框架
- **TypeScript** - 类型安全的 JavaScript
- **SQLite** - 轻量级数据库 (better-sqlite3)
- **@fastify/cors** - CORS 支持

## 安装依赖

```bash
npm install
```

## 开发

启动开发服务器（支持热重载）：

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

## 构建

编译 TypeScript 代码：

```bash
npm run build
```

## 生产运行

```bash
npm start
```

## API 端点

### 乐队推荐
- `POST /api/recommend` - 获取乐队推荐
  - 请求体：`{ genres: string[], preferences?: string[] }`
  - 响应：推荐乐队列表

### 数据管理
- 数据库文件位置：`data/bands.db`
- 首次运行会自动初始化数据库和乐队数据

## 项目结构

```
backend/
├── src/
│   ├── config.ts          # 配置文件
│   ├── database.ts        # 数据库连接与操作
│   ├── llmClient.ts       # LLM 客户端
│   ├── recommendationEngine.ts  # 推荐引擎
│   ├── server.ts          # 服务器入口
│   ├── staticBands.ts     # 静态乐队数据
│   └── types.ts           # TypeScript 类型定义
├── data/                  # 数据库文件目录
└── dist/                  # 编译输出目录
```

## 配置

编辑 `config.json` 文件可以修改服务器配置：
- 端口号
- 数据库路径
- LLM API 配置