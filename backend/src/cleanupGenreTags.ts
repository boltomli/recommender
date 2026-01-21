import { DatabaseManager } from './database';
import { LLMClient } from './llmClient';
import { loadConfig } from './config';

interface GenreCleanupResult {
  bandId: string;
  bandName: string;
  originalGenres: string[];
  cleanedGenres: string[];
  removedTags: string[];
}

// 定义允许的流派列表（与 genres.json 保持一致）
const ALLOWED_GENRES = [
  'black',
  'death',
  'doom',
  'folk',
  'glam',
  'groove',
  'hard rock',
  'heavy',
  'power',
  'progressive',
  'sludge',
  'speed',
  'thrash',
  'viking'
];

/**
 * 清理乐队流派标签
 * 使用LLM分析并移除不合适的标签，只保留主要流派
 * 确保返回的流派标签在允许的范围内
 */
async function cleanupBandGenres(
  bandName: string,
  currentGenres: string[],
  description: string
): Promise<string[]> {
  const llmClient = new LLMClient({
    endpoint: loadConfig().llm.endpoint,
    model: loadConfig().llm.model,
    timeout: loadConfig().llm.timeout
  });

  const genresText = currentGenres.join(', ');
  const allowedGenresText = ALLOWED_GENRES.join(', ');

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a metal music expert specializing in genre classification. Your task is to analyze a band\'s genre tags and identify which are the most accurate and primary genres. Remove redundant, overly broad, or inaccurate tags. Keep only the most specific and relevant genres (typically 1-3 tags). IMPORTANT: You must ONLY use genres from the allowed list provided, OR genres that contain one of the allowed genres as a substring (e.g., "technical death" contains "death", so both can be kept). Your response must be valid JSON ONLY, no other text or formatting. Format: {"genres": ["genre1", "genre2"]}'
    },
    {
      role: 'user' as const,
      content: `Analyze the genre tags for the metal band "${bandName}".

Current genres: ${genresText}
Description: ${description}

Allowed genres (MUST use only these, or genres containing these): ${allowedGenresText}

Review these genre tags and:
1. Keep only the most accurate and specific genres from the ALLOWED list
2. You may also keep genres that CONTAIN one of the allowed genres (e.g., "technical death", "melodic black", "progressive death")
3. Remove redundant or overly broad tags
4. Remove tags that don't accurately describe the band's sound
5. Focus on the band's primary musical style
6. Keep the list concise (ideally 1-3 genres, maximum 4)
7. CRITICAL: Only return genres that either exist in the allowed list OR contain an allowed genre as a substring

Return ONLY valid JSON, no explanations or additional text.`
    }
  ];

  try {
    const response = await llmClient['callLLM'](messages);
    const content = response.choices[0]?.message?.content || '{}';
    
    // Clean the response (remove thinking tags, etc.)
    let cleaned = content.replace(/[\s\S]*?<\/think>/gi, '');
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    cleaned = cleaned.replace(/```(?:json|JSON)?\s*/g, '');
    cleaned = cleaned.replace(/```\s*$/g, '');
    cleaned = cleaned.trim();

    const result = JSON.parse(cleaned);
    const cleanedGenres = result.genres || currentGenres;
    
    // 过滤：只保留在允许列表中的流派，或包含允许流派的流派
    const filteredGenres = cleanedGenres.filter((g: string) => {
      const genreLower = g.toLowerCase().trim();
      
      // 1. 直接匹配允许的流派
      if (ALLOWED_GENRES.includes(genreLower)) {
        return true;
      }
      
      // 2. 检查是否包含任何允许的流派（如 "technical death" 包含 "death"）
      return ALLOWED_GENRES.some(allowed => genreLower.includes(allowed));
    });
    
    // 如果过滤后为空，返回原始流派
    return filteredGenres.length > 0 ? filteredGenres : currentGenres;
  } catch (error) {
    console.error(`Error cleaning genres for ${bandName}:`, error);
    // On error, return original genres
    return currentGenres;
  }
}

async function main() {
  console.log('开始清理乐队流派标签...\n');

  const config = loadConfig();
  const dbManager = new DatabaseManager(config.database.path);

  // 获取所有乐队
  const allBands = dbManager.getAllBands();
  console.log(`共找到 ${allBands.length} 支乐队\n`);

  const results: GenreCleanupResult[] = [];
  let processedCount = 0;
  let modifiedCount = 0;

  for (const band of allBands) {
    processedCount++;
    console.log(`[${processedCount}/${allBands.length}] 处理: ${band.name}`);
    console.log(`  当前流派: ${band.genre.join(', ')}`);

    // 跳过只有一个标签的乐队（已经足够简洁）
    if (band.genre.length <= 1) {
      console.log('  只有一个标签，跳过处理\n');
      continue;
    }

    // 使用LLM清理流派标签
    const cleanedGenres = await cleanupBandGenres(
      band.name,
      band.genre,
      band.description
    );

    const originalGenres = [...band.genre];
    const removedTags = originalGenres.filter(g => !cleanedGenres.includes(g));

    if (removedTags.length > 0) {
      modifiedCount++;
      console.log(`  清理后流派: ${cleanedGenres.join(', ')}`);
      console.log(`  移除标签: ${removedTags.join(', ')}`);

      // 更新数据库
      dbManager.updateBandGenres(band.id, cleanedGenres);

      results.push({
        bandId: band.id,
        bandName: band.name,
        originalGenres,
        cleanedGenres,
        removedTags
      });
    } else {
      console.log('  无需修改\n');
    }

    console.log('');
  }

  dbManager.close();

  // 输出摘要
  console.log('\n=== 清理完成 ===');
  console.log(`处理总数: ${processedCount}`);
  console.log(`修改数量: ${modifiedCount}`);
  console.log(`跳过数量: ${processedCount - modifiedCount}`);

  if (results.length > 0) {
    console.log('\n=== 修改详情 ===');
    results.forEach(result => {
      console.log(`\n${result.bandName}:`);
      console.log(`  原始: ${result.originalGenres.join(', ')}`);
      console.log(`  清理后: ${result.cleanedGenres.join(', ')}`);
      console.log(`  移除: ${result.removedTags.join(', ')}`);
    });
  }
}

// 运行主函数
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});