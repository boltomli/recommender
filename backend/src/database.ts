// 为了保持向后兼容，重新导出 DatabaseManager
// 新的数据库管理器位于 ./db/index.ts
export { DatabaseManager, dbManager, IDatabase } from './db';
