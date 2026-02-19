/**
 * 数据验证脚本
 * 检查所有数据源（staticBands、SQLite、PostgreSQL）中的数据是否符合规范
 */

import { Band } from './types';
import { STATIC_BANDS } from './staticBands';
import {
  STANDARD_GENRES,
  isValidGenre,
  isValidEra,
  isValidTier,
  isValidBandName,
  FIELD_LIMITS
} from './dataStandards';
import { loadConfig } from './config';
import { DatabaseManager } from './db';

interface ValidationIssue {
  source: string;
  bandId: string;
  bandName: string;
  field: string;
  issue: string;
  currentValue: any;
  suggestion?: string;
}

interface ValidationResult {
  source: string;
  totalBands: number;
  validBands: number;
  issues: ValidationIssue[];
}

/**
 * 验证单个乐队数据
 */
function validateBand(band: Band, source: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 验证 ID
  if (!band.id || typeof band.id !== 'string') {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'id',
      issue: 'Missing or invalid ID',
      currentValue: band.id
    });
  }

  // 验证名称
  if (!isValidBandName(band.name)) {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'name',
      issue: `Invalid name length (${band.name?.length || 0} chars, expected ${FIELD_LIMITS.name.min}-${FIELD_LIMITS.name.max})`,
      currentValue: band.name,
      suggestion: 'Ensure name is between 1-100 characters'
    });
  }

  // 验证流派
  if (!band.genre || !Array.isArray(band.genre) || band.genre.length === 0) {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'genre',
      issue: 'Missing or invalid genre array',
      currentValue: band.genre,
      suggestion: 'Genre must be a non-empty array'
    });
  } else {
    // 检查流派数量
    if (band.genre.length > FIELD_LIMITS.genre.max) {
      issues.push({
        source,
        bandId: band.id,
        bandName: band.name,
        field: 'genre',
        issue: `Too many genres (${band.genre.length}, max ${FIELD_LIMITS.genre.max})`,
        currentValue: band.genre,
        suggestion: `Limit to ${FIELD_LIMITS.genre.max} genres`
      });
    }

    // 检查每个流派是否标准
    band.genre.forEach((g, idx) => {
      if (!isValidGenre(g)) {
        issues.push({
          source,
          bandId: band.id,
          bandName: band.name,
          field: `genre[${idx}]`,
          issue: `Non-standard genre: "${g}"`,
          currentValue: g,
          suggestion: `Use one of: ${STANDARD_GENRES.join(', ')}`
        });
      }
    });
  }

  // 验证年代
  if (!band.era || typeof band.era !== 'string') {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'era',
      issue: 'Missing or invalid era',
      currentValue: band.era,
      suggestion: 'Era is required (e.g., "1980s", "1990s-present")'
    });
  } else if (!isValidEra(band.era) && band.era !== 'Unknown') {
    issues.push({
      source,
      bandId: band.id,
      bandName: band.name,
      field: 'era',
      issue: `Invalid era format: "${band.era}"`,
      currentValue: band.era,
      suggestion: 'Use format like: "1980s", "1990s-2000s", "2000s-present"'
    });
  }

  // 验证专辑
  if (!band.albums || !Array.isArray(band.albums)) {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'albums',
      issue: 'Missing or invalid albums array',
      currentValue: band.albums,
      suggestion: 'Albums must be an array'
    });
  } else {
    if (band.albums.length === 0) {
      issues.push({
        source,
        bandId: band.id,
        bandName: band.name,
        field: 'albums',
        issue: 'Empty albums array',
        currentValue: band.albums,
        suggestion: 'Provide at least 1 notable album'
      });
    }

    if (band.albums.length > FIELD_LIMITS.albums.max) {
      issues.push({
        source,
        bandId: band.id,
        bandName: band.name,
        field: 'albums',
        issue: `Too many albums (${band.albums.length}, max ${FIELD_LIMITS.albums.max})`,
        currentValue: band.albums,
        suggestion: `Limit to ${FIELD_LIMITS.albums.max} albums`
      });
    }

    // 检查空专辑名
    band.albums.forEach((album, idx) => {
      if (!album || typeof album !== 'string' || album.trim() === '') {
        issues.push({
          source,
          bandId: band.id,
          bandName: band.name,
          field: `albums[${idx}]`,
          issue: 'Empty or invalid album name',
          currentValue: album
        });
      }
    });
  }

  // 验证描述
  if (!band.description || typeof band.description !== 'string') {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'description',
      issue: 'Missing description',
      currentValue: band.description,
      suggestion: 'Description is required (10-500 characters)'
    });
  } else {
    if (band.description.length < FIELD_LIMITS.description.min) {
      issues.push({
        source,
        bandId: band.id,
        bandName: band.name,
        field: 'description',
        issue: `Description too short (${band.description.length} chars, min ${FIELD_LIMITS.description.min})`,
        currentValue: band.description.substring(0, 50) + '...',
        suggestion: 'Provide a more detailed description'
      });
    }

    if (band.description.length > FIELD_LIMITS.description.max) {
      issues.push({
        source,
        bandId: band.id,
        bandName: band.name,
        field: 'description',
        issue: `Description too long (${band.description.length} chars, max ${FIELD_LIMITS.description.max})`,
        currentValue: band.description.substring(0, 50) + '...',
        suggestion: 'Shorten the description'
      });
    }
  }

  // 验证 styleNotes（可选字段）
  if (band.styleNotes && typeof band.styleNotes === 'string') {
    if (band.styleNotes.length > FIELD_LIMITS.styleNotes.max) {
      issues.push({
        source,
        bandId: band.id,
        bandName: band.name,
        field: 'styleNotes',
        issue: `Style notes too long (${band.styleNotes.length} chars, max ${FIELD_LIMITS.styleNotes.max})`,
        currentValue: band.styleNotes.substring(0, 50) + '...',
        suggestion: 'Shorten the style notes'
      });
    }
  }

  // 验证 tier
  if (!band.tier) {
    issues.push({
      source,
      bandId: band.id || 'unknown',
      bandName: band.name || 'unknown',
      field: 'tier',
      issue: 'Missing tier',
      currentValue: band.tier,
      suggestion: 'Tier is required: well-known, popular, or niche'
    });
  } else if (!isValidTier(band.tier)) {
    issues.push({
      source,
      bandId: band.id,
      bandName: band.name,
      field: 'tier',
      issue: `Invalid tier: "${band.tier}"`,
      currentValue: band.tier,
      suggestion: 'Use: well-known, popular, or niche'
    });
  }

  return issues;
}

/**
 * 检查 staticBands 数据
 */
function checkStaticBands(): ValidationResult {
  console.log('\n=== Checking Static Bands ===');
  const issues: ValidationIssue[] = [];
  let totalBands = 0;

  for (const [genre, bands] of Object.entries(STATIC_BANDS)) {
    console.log(`Checking genre: ${genre} (${bands.length} bands)`);
    totalBands += bands.length;

    for (const band of bands) {
      const bandIssues = validateBand(band, `staticBands:${genre}`);
      issues.push(...bandIssues);
    }
  }

  const validBands = totalBands - new Set(issues.map(i => i.bandId)).size;

  return {
    source: 'staticBands',
    totalBands,
    validBands,
    issues
  };
}

/**
 * 检查数据库中的数据
 */
async function checkDatabase(): Promise<ValidationResult> {
  console.log('\n=== Checking Database ===');
  const issues: ValidationIssue[] = [];

  // 检查是否有数据库连接配置
  const hasPostgres = !!(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
  const sqlitePath = process.env.SQLITE_PATH || './data/bands.db';

  if (!hasPostgres) {
    console.log('No PostgreSQL configuration found, checking SQLite...');
    // 检查 SQLite 文件是否存在
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.resolve(sqlitePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`SQLite database not found at: ${fullPath}`);
      return {
        source: 'database (sqlite)',
        totalBands: 0,
        validBands: 0,
        issues: []
      };
    }
    console.log(`Found SQLite database at: ${fullPath}`);
  }

  try {
    const dbManager = new DatabaseManager();
    const db = await dbManager.initialize();

    const allBands = await db.getAllBands();
    console.log(`Found ${allBands.length} bands in database`);

    for (const band of allBands) {
      const bandIssues = validateBand(band, 'database');
      issues.push(...bandIssues);
    }

    await dbManager.close();

    const validBands = allBands.length - new Set(issues.map(i => i.bandId)).size;

    return {
      source: hasPostgres ? 'database (postgresql)' : 'database (sqlite)',
      totalBands: allBands.length,
      validBands,
      issues
    };
  } catch (error) {
    console.error('Error checking database:', error);
    return {
      source: 'database',
      totalBands: 0,
      validBands: 0,
      issues: [{
        source: 'database',
        bandId: 'N/A',
        bandName: 'N/A',
        field: 'connection',
        issue: `Failed to connect or query database: ${error}`,
        currentValue: null
      }]
    };
  }
}

/**
 * 生成验证报告
 */
function generateReport(results: ValidationResult[]): void {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  DATA VALIDATION REPORT                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  let totalIssues = 0;
  let totalBands = 0;
  let totalValid = 0;

  for (const result of results) {
    console.log(`\n📊 ${result.source.toUpperCase()}`);
    console.log(`   Total Bands: ${result.totalBands}`);
    console.log(`   Valid Bands: ${result.validBands}`);
    console.log(`   Issues Found: ${result.issues.length}`);

    totalBands += result.totalBands;
    totalValid += result.validBands;
    totalIssues += result.issues.length;

    if (result.issues.length > 0) {
      console.log('\n   Issues by Field:');
      const fieldCounts: Record<string, number> = {};
      for (const issue of result.issues) {
        fieldCounts[issue.field] = (fieldCounts[issue.field] || 0) + 1;
      }
      for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`     - ${field}: ${count}`);
      }
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Total Bands Checked: ${totalBands}`);
  console.log(`Total Valid Bands: ${totalValid}`);
  console.log(`Total Issues: ${totalIssues}`);
  console.log(`Compliance Rate: ${totalBands > 0 ? ((totalValid / totalBands) * 100).toFixed(1) : 0}%`);

  // 详细问题列表
  if (totalIssues > 0) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   DETAILED ISSUES                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    for (const result of results) {
      if (result.issues.length > 0) {
        console.log(`\n--- ${result.source} ---`);
        // 按字段分组显示
        const grouped: Record<string, ValidationIssue[]> = {};
        for (const issue of result.issues) {
          if (!grouped[issue.field]) grouped[issue.field] = [];
          grouped[issue.field].push(issue);
        }

        for (const [field, issues] of Object.entries(grouped).slice(0, 5)) {
          console.log(`\n  [${field}] - ${issues.length} issues`);
          for (const issue of issues.slice(0, 3)) {
            console.log(`    • ${issue.bandName}: ${issue.issue}`);
            if (issue.suggestion) {
              console.log(`      Suggestion: ${issue.suggestion}`);
            }
          }
          if (issues.length > 3) {
            console.log(`    ... and ${issues.length - 3} more`);
          }
        }
      }
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 Starting Data Validation...');
  console.log(`📋 Standards: ${STANDARD_GENRES.join(', ')}`);

  const args = process.argv.slice(2);
  const skipDb = args.includes('--skip-db') || args.includes('-s');
  const onlyStatic = args.includes('--only-static') || args.includes('-o');

  const results: ValidationResult[] = [];

  // 检查 staticBands
  results.push(checkStaticBands());

  // 检查数据库（除非被跳过）
  if (!onlyStatic) {
    if (skipDb) {
      console.log('\n⚠️  Skipping database check (--skip-db flag)');
    } else {
      results.push(await checkDatabase());
    }
  }

  // 生成报告
  generateReport(results);

  // 退出码
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  process.exit(totalIssues > 0 ? 1 : 0);
}

// 运行验证
main().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});
