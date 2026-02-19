/**
 * 修复 staticBands.ts 中的数据规范问题
 * 主要修复流派映射
 */

import * as fs from 'fs';
import * as path from 'path';
import { GENRE_MAPPINGS, StandardGenre, STANDARD_GENRES } from './dataStandards';

// 读取 staticBands.ts 文件
const staticBandsPath = path.join(__dirname, 'staticBands.ts');
let content = fs.readFileSync(staticBandsPath, 'utf-8');

console.log('🔧 Fixing staticBands.ts data...');

// 统计
let totalBands = 0;
let fixedBands = 0;
const genreFixes: Record<string, number> = {};

// 正则匹配每个乐队对象
const bandRegex = /\{\s*id:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"],\s*genre:\s*(\[[^\]]+\])/g;

let match;
while ((match = bandRegex.exec(content)) !== null) {
  totalBands++;
  const fullMatch = match[0];
  const bandId = match[1];
  const bandName = match[2];
  const genreArrayStr = match[3];

  // 解析流派数组
  const genreMatches = genreArrayStr.match(/['"]([^'"]+)['"]/g);
  if (!genreMatches) continue;

  const originalGenres = genreMatches.map(g => g.replace(/['"]/g, ''));
  const normalizedGenres: StandardGenre[] = [];
  let hasChanges = false;

  for (const genre of originalGenres) {
    const lowerGenre = genre.toLowerCase().trim();

    // 检查是否已经是标准流派
    if (STANDARD_GENRES.includes(lowerGenre as StandardGenre)) {
      normalizedGenres.push(lowerGenre as StandardGenre);
    }
    // 检查是否有映射
    else if (GENRE_MAPPINGS[lowerGenre]) {
      const mapped = GENRE_MAPPINGS[lowerGenre];
      normalizedGenres.push(mapped);
      hasChanges = true;

      // 记录修复
      const fixKey = `${genre} -> ${mapped}`;
      genreFixes[fixKey] = (genreFixes[fixKey] || 0) + 1;
    }
    // 无法识别的流派，跳过
    else {
      console.warn(`⚠️  Unknown genre "${genre}" for band "${bandName}"`);
    }
  }

  // 去重
  const uniqueGenres = [...new Set(normalizedGenres)];

  // 如果有变化，替换文本
  if (hasChanges || uniqueGenres.length !== originalGenres.length) {
    fixedBands++;

    // 构建新的流派数组字符串
    const newGenreArray = uniqueGenres.map(g => `"${g}"`).join(', ');
    const newGenreStr = `[${newGenreArray}]`;

    // 替换内容
    const newFullMatch = fullMatch.replace(genreArrayStr, newGenreStr);
    content = content.replace(fullMatch, newFullMatch);

    console.log(`✅ Fixed "${bandName}": ${originalGenres.join(', ')} -> ${uniqueGenres.join(', ')}`);
  }
}

// 写回文件
fs.writeFileSync(staticBandsPath, content, 'utf-8');

console.log('\n📊 Summary:');
console.log(`Total bands processed: ${totalBands}`);
console.log(`Bands fixed: ${fixedBands}`);
console.log('\nGenre mapping breakdown:');
for (const [mapping, count] of Object.entries(genreFixes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${mapping}: ${count}`);
}

console.log('\n✨ Done! File updated.');
