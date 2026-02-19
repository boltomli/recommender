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

服务器将在 `http://localhost:3001` 启动。

## 构建

编译 TypeScript 代码：

```bash
npm run build
```

## 生产运行

```bash
npm start
```

## CLI 命令

后端提供了数据管理命令：

### 导出数据

从数据库导出所有数据到 JSON 文件：

```bash
npm run export-data
```

这将生成以下文件到 `frontend/public/data/`：
- `genres.json` - 音乐流派列表
- `bands.json` - 所有乐队数据
- `recommendations.json` - 预生成的推荐

### 导入数据

从 LLM 导入新的乐队数据：

```bash
npm run import-data
```

可选环境变量：
- `GENRE` - 音乐流派（默认：thrash）
- `COUNT` - 导入乐队数量（默认：5）

示例：
```bash
# Windows PowerShell
$env:GENRE="death"; $env:COUNT="10"; npm run import-data

# Linux/Mac
GENRE=death COUNT=10 npm run import-data
```

### 生成推荐

为所有流派生成推荐并导出：

```bash
npm run generate-recommendations
```

### 完整更新流程

执行完整的更新流程，包括 tier 更新、流派扩展、重名处理和数据同步：

```bash
npm run full-update
```

此命令会依次执行：
1. 更新所有乐队的 tier 信息
2. 扩展不足的流派
3. 自动处理重名乐队
4. 同步数据到所有存储位置（带备份和验证）

### 数据同步

将数据库数据同步到所有存储位置：

```bash
npm run sync-data
```

选项：
- `--source <db|static>` - 数据源（默认：db）
- `--dry-run` - 模拟运行
- `--backup` - 同步前备份文件
- `--verify` - 同步后验证数据一致性
- `--help` - 显示帮助信息

### 数据填充

从 `staticBands.ts` 填充乐队数据到数据库：

```bash
# 填充所有分类
npm run fill-bands fill

# 填充指定分类
npm run fill-bands fill-category thrash

# 显示统计信息
npm run fill-bands stats
```

## API 端点

### 健康检查
- `GET /health` - 服务器健康状态

### 流派管理
- `GET /api/genres` - 获取所有音乐流派

### 会话管理
- `POST /api/session` - 创建新会话
  - 请求体：`{ genre: string }`
  - 响应：`{ sessionId: string }`

### 乐队对比
- `GET /api/comparison` - 获取对比乐队对
  - 查询参数：`sessionId`
  - 响应：`{ band1, band2 }` 或 `{ done: true }`

- `POST /api/preference` - 提交偏好选择
  - 请求体：`{ sessionId, bandId1, bandId2, selectedBandId }`

- `POST /api/skip` - 跳过当前对比
  - 请求体：`{ sessionId, bandId1, bandId2 }`

### 推荐
- `GET /api/suggestions` - 获取实时建议
  - 查询参数：`sessionId, count?`

- `GET /api/recommendations` - 获取推荐列表
  - 查询参数：`sessionId`

### 数据导出
- `GET /api/export` - 导出所有数据
- `GET /api/export/genres` - 仅导出流派
- `GET /api/export/bands` - 仅导出乐队
- `GET /api/export/recommendations` - 仅导出推荐

### 数据导入
- `POST /api/import/llm` - 从 LLM 导入乐队

### 批量推荐生成
- `POST /api/recommendations/generate` - 生成批量推荐

## 数据管理

### 数据库文件位置
- `data/bands.db`

### 首次运行
首次运行会自动初始化数据库和乐队数据。

### 数据刷新流程

1. **从 LLM 导入新数据**：
   ```bash
   npm run import-data
   ```

2. **生成推荐**：
   ```bash
   npm run generate-recommendations
   ```

3. **导出数据到前端**：
   ```bash
   npm run export-data
   ```

或使用完整构建命令（在 frontend 目录）：
```bash
npm run build-with-data
```

## 项目结构

```
backend/
├── src/
│   ├── server.ts               # 服务器入口
│   ├── cli.ts                  # CLI 命令入口
│   ├── database.ts             # 数据库连接与操作
│   ├── staticBands.ts          # 静态乐队数据
│   ├── types.ts                # TypeScript 类型定义
│   ├── config.ts               # 配置文件
│   ├── llmClient.ts            # LLM 客户端
│   ├── recommendationEngine.ts # 推荐引擎
│   ├── exportData.ts           # 数据导出工具
│   ├── importData.ts           # 数据导入工具
│   ├── batchRecommendations.ts # 批量推荐生成器
│   ├── fillBandsByCategory.ts  # 数据填充脚本
│   ├── syncBandData.ts         # 数据同步脚本
│   ├── updateBandTiers.ts      # Tier 更新脚本
│   ├── expandGenreBands.ts     # 流派扩展脚本
│   ├── handleDuplicateNames.ts # 重名处理脚本
│   └── db/                     # 数据库管理器
├── data/                       # 数据库文件目录
│   └── bands.db
├── cache/                      # 缓存目录
└── dist/                       # 编译输出目录
```

## 配置

编辑 `config.json` 文件可以修改服务器配置：

```json
{
  "llm": {
    "endpoint": "http://localhost:8000/v1/chat/completions",
    "model": "gpt-4",
    "timeout": 60000
  },
  "database": {
    "path": "./data/bands.db"
  },
  "app": {
    "maxRecommendations": 10
  }
}
```

### 环境变量

可以通过环境变量覆盖配置：
- `LLM_ENDPOINT` - LLM API 端点
- `LLM_MODEL` - LLM 模型名称
- `LLM_AUTH_TOKEN` - LLM API 认证令牌
- `DATABASE_PATH` - 数据库文件路径

## 架构

后端支持两种使用模式：

### 1. API 模式（传统）
- 前端通过 HTTP API 与后端通信
- 实时数据更新
- 适用于开发和测试

### 2. 数据管理模式（推荐）
- 后端作为数据管理工具
- 导出数据为静态 JSON 文件
- 前端使用静态数据，无需后端运行
- 适用于生产部署和静态托管
