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

后端提供了数据管理命令，用于导出数据、导入数据和生成推荐：

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
GENRE=death COUNT=10 npm run import-data
```

### 生成推荐

为所有流派生成推荐并导出：

```bash
npm run generate-recommendations
```

### Tier 更新

使用 LLM 更新所有乐队的 tier 信息（well-known/popular/niche）：

```bash
npm run update-tiers
```

选项：
- `--genre <name>` - 仅更新指定流派
- `--dry-run` - 模拟运行，不实际更新
- `--force` - 强制更新，忽略缓存
- `--batch-size <n>` - 批处理大小（默认：10）
- `--backup` - 更新前备份数据库
- `--help` - 显示帮助信息

示例：
```bash
# 更新所有乐队
npm run update-tiers

# 仅更新 thrash 流派
npm run update-tiers -- --genre thrash

# 模拟运行
npm run update-tiers -- --dry-run

# 强制更新并备份
npm run update-tiers -- --force --backup
```

### 流派扩展

为乐队数量不足的流派生成更多乐队：

```bash
npm run expand-genres
```

选项：
- `--genre <name>` - 仅扩展指定流派
- `--target-count <n>` - 目标乐队数量（覆盖配置）
- `--dry-run` - 模拟运行
- `--force` - 强制重新生成，忽略缓存
- `--help` - 显示帮助信息

示例：
```bash
# 扩展所有不足的流派
npm run expand-genres

# 仅扩展 folk 流派
npm run expand-genres -- --genre folk

# 设置目标数量为 100
npm run expand-genres -- --target-count 100
```

### 重名处理

检测并处理重名乐队，添加区分信息：

```bash
npm run handle-duplicates
```

选项：
- `--genre <name>` - 仅处理指定流派
- `--dry-run` - 模拟运行
- `--auto-fix` - 自动修复，无需确认
- `--help` - 显示帮助信息

示例：
```bash
# 交互式处理所有重名
npm run handle-duplicates

# 自动修复所有重名
npm run handle-duplicates -- --auto-fix

# 仅处理 thrash 流派
npm run handle-duplicates -- --genre thrash
```

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

示例：
```bash
# 从数据库同步到所有位置
npm run sync-data

# 同步并验证
npm run sync-data -- --backup --verify

# 模拟运行
npm run sync-data -- --dry-run
```

### 流派清理

清理乐队数量不足的流派，移除小流派标签或删除仅属于小流派的乐队：

```bash
npm run cleanup-genres
```

选项：
- `--dry-run` - 模拟运行，预览清理操作
- `--backup` - 清理前备份所有数据文件
- `--min-bands <n>` - 最小乐队数量阈值（默认：10）
- `--help` - 显示帮助信息

示例：
```bash
# 预览清理操作
npm run cleanup-genres -- --dry-run

# 执行清理并备份
npm run cleanup-genres -- --backup

# 设置最小数量为 15
npm run cleanup-genres -- --min-bands 15
```

清理逻辑：
1. 统计每个流派的乐队数量
2. 识别所有少于阈值的流派（小流派）
3. 对于每个乐队：
   - 如果乐队有其他流派标签，则移除小流派标签，保留其他标签
   - 如果乐队只有小流派标签，则从数据库中删除该乐队
4. 同步清理后的数据到所有数据源（staticBands.ts、bands.json、genres.json）

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
  - 查询参数：`includeRecommendations?`

- `GET /api/export/genres` - 仅导出流派

- `GET /api/export/bands` - 仅导出乐队

- `GET /api/export/recommendations` - 仅导出推荐

### 数据导入
- `POST /api/import/llm` - 从 LLM 导入乐队
  - 请求体：`{ genre?, count? }`

### 批量推荐生成
- `POST /api/recommendations/generate` - 生成批量推荐
  - 请求体：`{ genre? }`（可选流派，不指定则生成所有流派）

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

4. **构建前端**（在 `frontend/` 目录）：
   ```bash
   npm run build
   ```

## 项目结构

```
backend/
├── src/
│   ├── config.ts               # 配置文件
│   ├── database.ts             # 数据库连接与操作
│   ├── llmClient.ts            # LLM 客户端
│   ├── recommendationEngine.ts # 推荐引擎
│   ├── server.ts               # 服务器入口
│   ├── staticBands.ts          # 静态乐队数据
│   ├── types.ts                # TypeScript 类型定义
│   ├── exportData.ts           # 数据导出工具
│   ├── importData.ts           # 数据导入工具
│   ├── batchRecommendations.ts # 批量推荐生成器
│   ├── cli.ts                  # CLI 命令入口
│   ├── cacheManager.ts         # 缓存管理工具
│   ├── updateBandTiers.ts      # Tier 更新脚本
│   ├── expandGenreBands.ts     # 流派扩展脚本
│   ├── handleDuplicateNames.ts # 重名处理脚本
│   └── syncBandData.ts         # 数据同步脚本
├── data/                       # 数据库文件目录
│   └── bands.db
├── cache/                      # 缓存目录
│   ├── tier-updates/           # Tier 更新缓存
│   └── genre-expansion/        # 流派扩展缓存
└── dist/                       # 编译输出目录
```

## 配置

编辑 `config.json` 文件可以修改服务器配置：

### 基础配置
- `llm.endpoint` - LLM API 端点
- `llm.model` - LLM 模型名称
- `llm.timeout` - LLM 请求超时时间（毫秒）
- `database.path` - 数据库文件路径
- `app.maxRecommendations` - 最大推荐数量

### Tier 更新配置
- `tierUpdate.enabled` - 是否启用 tier 更新功能（默认：false）
- `tierUpdate.cachePath` - Tier 更新缓存路径

### 流派扩展配置
- `expandGenres.enabled` - 是否启用流派扩展功能（默认：false）
- `expandGenres.minBandsForGenre` - 每个流派的最少乐队数量（默认：50）
- `expandGenres.cachePath` - 流派扩展缓存路径

### 流派清理配置
- `cleanup.enabled` - 是否启用流派清理功能（默认：true）
- `cleanup.minBandsThreshold` - 每个流派的最小乐队数量阈值（默认：10）

### 启用功能

要启用 tier 更新和流派扩展功能，需要修改 `config.json`：

```json
{
  "tierUpdate": {
    "enabled": true,
    "cachePath": "./cache/tier-updates"
  },
  "expandGenres": {
    "enabled": true,
    "minBandsForGenre": 30,
    "cachePath": "./cache/genre-expansion"
  }
}
```

## 架构

后端现在支持两种使用模式：

### 1. API 模式（传统）
- 前端通过 HTTP API 与后端通信
- 实时数据更新
- 适用于开发和测试

### 2. 数据管理模式（新）
- 后端作为数据管理工具
- 导出数据为静态 JSON 文件
- 前端使用静态数据，无需后端运行
- 适用于生产部署和静态托管