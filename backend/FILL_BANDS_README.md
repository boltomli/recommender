# 乐队数据填充脚本

## 概述

`fillBandsByCategory.ts` 是一个用于按分类填充乐队数据到数据库的脚本。它从 `staticBands.ts` 中读取所有分类的乐队数据，并将其导入到 SQLite 数据库中。

## 功能

- ✅ 填充所有分类的乐队数据
- ✅ 填充指定分类的乐队数据
- ✅ 清空指定分类的乐队数据
- ✅ 显示数据库统计信息
- ✅ 智能更新（仅更新有变化的乐队）
- ✅ 详细的进度日志

## 使用方法

### 1. 填充所有分类

```bash
npm run fill-bands fill
```

这将填充所有 10 个分类的乐队数据：
- thrash (激流金属)
- death (死亡金属)
- black (黑金属)
- power (力量金属)
- doom (厄运金属)
- progressive (前卫金属)
- heavy (重金属)
- speed (速度金属)
- groove (律动金属)
- folk (民谣金属)

### 2. 填充指定分类

```bash
npm run fill-bands fill-category thrash
```

可用的分类名称：
- `thrash`
- `death`
- `black`
- `power`
- `doom`
- `progressive`
- `heavy`
- `speed`
- `groove`
- `folk`

### 3. 清空指定分类

```bash
npm run fill-bands clear thrash
```

### 4. 显示统计信息

```bash
npm run fill-bands stats
```

这将显示：
- 总乐队数
- 按分类统计的乐队数量
- 按等级统计的乐队数量

## 输出示例

```
开始填充乐队数据...
发现 10 个分类: thrash, death, black, power, doom, progressive, heavy, speed, groove, folk

处理分类 "thrash": 34 个乐队
  ✓ 更新: Slayer
  ✓ 更新: Megadeth
  - 跳过: Metallica (已存在且无需更新)
分类 "thrash" 完成: 导入 0 个, 更新 33 个, 跳过 1 个

...

填充完成!
总计: 导入 0 个, 更新 491 个, 跳过 1 个

=== 数据库统计 ===
总乐队数: 371

按分类统计:
  heavy: 76
  progressive: 63
  death: 60
  ...

按等级统计:
  well-known: 1
  popular: 0
  niche: 370
```

## 数据库结构

### bands 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (PRIMARY KEY) | 乐队唯一标识符 |
| name | TEXT (NOT NULL) | 乐队名称 |
| genre | TEXT (NOT NULL) | 音乐分类（JSON 数组） |
| era | TEXT (NOT NULL) | 活跃年代 |
| albums | TEXT (NOT NULL) | 代表专辑（JSON 数组） |
| description | TEXT (NOT NULL) | 乐队描述 |
| style_notes | TEXT | 风格备注 |
| tier | TEXT (NOT NULL) | 知名度等级（well-known/popular/niche） |
| embedding | BLOB | 向量嵌入（可选） |
| created_at | TIMESTAMP | 创建时间 |

### 索引

- `idx_bands_genre`: 按分类索引
- `idx_bands_tier`: 按等级索引

## 等级说明

乐队按知名度分为三个等级：

- **well-known**: 广为人知的经典乐队（如 Metallica、Iron Maiden）
- **popular**: 较为知名的主流乐队
- **niche**: 小众乐队和地下乐队

## 数据来源

乐队数据存储在 `src/staticBands.ts` 文件中，按分类组织：

```typescript
export const STATIC_BANDS: Record<string, Band[]> = {
  thrash: [
    {
      id: 'band_metallica_1',
      name: 'Metallica',
      genre: ['thrash', 'heavy'],
      era: '1980s',
      albums: ['Master of Puppets', 'Ride the Lightning', '...And Justice for All'],
      description: 'One of the most influential thrash metal bands...',
      styleNotes: 'Evolved from pure thrash to more progressive...',
      tier: 'well-known'
    },
    // ...
  ],
  // ...
};
```

## 数据库迁移

如果数据库结构需要更新，可以使用迁移脚本：

```bash
npm run migrate-db
```

这将自动添加缺失的列和索引。

## 注意事项

1. **数据一致性**: 脚本会检查现有数据，仅更新有变化的乐队
2. **ID 唯一性**: 每个乐队必须有唯一的 ID
3. **分类格式**: genre 字段存储为 JSON 数组，支持多分类
4. **数据库路径**: 默认为 `data/bands.db`，可在 `config.json` 中配置

## 故障排除

### 错误: "no such column: tier"

运行数据库迁移：

```bash
npm run migrate-db
```

### 错误: "The database connection is not open"

确保在调用 `showStats()` 之前数据库连接未关闭。脚本会自动管理连接。

### 数据未更新

检查 `needsUpdate()` 方法中的比较逻辑，确保关键字段确实有变化。

## 扩展功能

如需添加新功能，可以考虑：

1. **批量导入**: 从 JSON/CSV 文件导入乐队数据
2. **数据验证**: 添加更严格的数据验证规则
3. **备份功能**: 在更新前自动备份数据库
4. **增量更新**: 仅导入新增的乐队
5. **导出功能**: 将数据库导出为 JSON 格式

## 相关文件

- `src/fillBandsByCategory.ts`: 主脚本
- `src/staticBands.ts`: 乐队数据源
- `src/database.ts`: 数据库管理器
- `src/migrateDatabase.ts`: 数据库迁移脚本
- `src/types.ts`: TypeScript 类型定义
- `config.json`: 配置文件

## 许可证

ISC