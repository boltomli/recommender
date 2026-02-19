import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AppConfig } from './types';

// 加载 .env 文件中的环境变量
dotenv.config();

let config: AppConfig | null = null;

export function loadConfig(configPath: string = './config.json'): AppConfig {
  if (config) {
    return config;
  }

  const absolutePath = path.resolve(configPath);
  const configData = fs.readFileSync(absolutePath, 'utf-8');
  config = JSON.parse(configData) as AppConfig;

  // Allow environment variable overrides
  if (process.env.LLM_ENDPOINT) {
    config.llm.endpoint = process.env.LLM_ENDPOINT;
  }
  if (process.env.LLM_MODEL) {
    config.llm.model = process.env.LLM_MODEL;
  }
  if (process.env.LLM_AUTH_TOKEN) {
    config.llm.apiKey = process.env.LLM_AUTH_TOKEN;
  }
  if (process.env.DATABASE_PATH) {
    config.database.path = process.env.DATABASE_PATH;
  }

  return config;
}

export function getConfig(): AppConfig {
  if (!config) {
    return loadConfig();
  }
  return config;
}