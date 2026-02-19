/**
 * 数据规范定义文件
 * 定义所有乐队数据的内容和格式规范，确保数据一致性
 */

import { Band, BandTier } from './types';

// ============ 标准流派列表 ============
export const STANDARD_GENRES = [
  'thrash',
  'death',
  'black',
  'power',
  'doom',
  'progressive',
  'heavy',
  'speed',
  'groove',
  'folk'
] as const;

export type StandardGenre = typeof STANDARD_GENRES[number];

// ============ 年代格式规范 ============
export const ERA_PATTERNS = {
  // 1980s, 1990s, etc.
  decade: /^\d{4}s$/i,
  // 1980s-present, 1990s-2000s, etc.
  range: /^\d{4}s?-\d{4}s?$/i,
  // 1980s-present
  ongoing: /^\d{4}s?-present$/i,
  // 1980-1990, 1995-present, etc.
  years: /^\d{4}-(?:\d{4}|present)$/i
};

export const ERA_EXAMPLES = [
  '1980s',
  '1990s-2000s',
  '2000s-present',
  '1980-1995',
  '1990-present'
];

// ============ Tier 定义 ============
export const TIER_DEFINITIONS: Record<BandTier, { description: string; examples: string[] }> = {
  'well-known': {
    description: 'Globally famous bands with mainstream recognition outside the metal community',
    examples: ['Metallica', 'Iron Maiden', 'Black Sabbath', 'Slayer', 'Megadeth']
  },
  'popular': {
    description: 'Well-known within the metal community with significant following',
    examples: ['Testament', 'Exodus', 'Overkill', 'Death', 'Carcass']
  },
  'niche': {
    description: 'Underground or limited recognition but influential within specific scenes',
    examples: ['Darkthrone', 'Mayhem', 'Emperor', 'Bathory', 'Celtic Frost']
  }
};

// ============ 字段长度限制 ============
export const FIELD_LIMITS = {
  name: { min: 1, max: 100 },
  description: { min: 10, max: 500 },
  styleNotes: { min: 0, max: 200 },
  albums: { min: 1, max: 5 },
  genre: { min: 1, max: 3 }
};

// ============ 默认描述模板 ============
export const DEFAULT_DESCRIPTION_TEMPLATES = {
  withEra: (name: string, genres: string[], era: string) =>
    `${name} is a ${genres.join('/')} metal band from the ${era}.`,

  withoutEra: (name: string, genres: string[]) =>
    `${name} is a ${genres.join('/')} metal band.`,

  withStyle: (name: string, genres: string[], style: string) =>
    `${name} is a ${genres.join('/')} metal band known for ${style}.`
};

// ============ 数据验证函数 ============

/**
 * 验证流派是否标准
 */
export function isValidGenre(genre: string): boolean {
  return STANDARD_GENRES.includes(genre.toLowerCase() as StandardGenre);
}

/**
 * 标准化流派名称
 */
export function normalizeGenre(genre: string): StandardGenre | null {
  const normalized = genre.toLowerCase().trim();
  if (STANDARD_GENRES.includes(normalized as StandardGenre)) {
    return normalized as StandardGenre;
  }
  return null;
}

/**
 * 标准化流派列表
 */
export function normalizeGenres(genres: string[], primaryGenre: string): StandardGenre[] {
  const normalized = genres
    .map(g => normalizeGenre(g))
    .filter((g): g is StandardGenre => g !== null);

  // 确保主流派在首位
  const primary = primaryGenre.toLowerCase() as StandardGenre;
  if (!normalized.includes(primary)) {
    normalized.unshift(primary);
  }

  // 去重并限制数量
  const unique = [...new Set(normalized)];
  return unique.slice(0, FIELD_LIMITS.genre.max);
}

/**
 * 验证年代格式
 */
export function isValidEra(era: string): boolean {
  return Object.values(ERA_PATTERNS).some(pattern => pattern.test(era));
}

/**
 * 标准化年代格式
 */
export function normalizeEra(era: string): string {
  if (!era || typeof era !== 'string') {
    return 'Unknown';
  }

  const trimmed = era.trim();

  // 检查是否符合任何已知模式
  if (isValidEra(trimmed)) {
    return trimmed;
  }

  // 尝试修复常见格式
  // 处理 "1980's" -> "1980s"
  const fixed = trimmed
    .replace(/(\d{4})['']s/i, '$1s')
    .replace(/present/i, 'present');

  if (isValidEra(fixed)) {
    return fixed;
  }

  return 'Unknown';
}

/**
 * 验证 tier 值
 */
export function isValidTier(tier: string): tier is BandTier {
  return ['well-known', 'popular', 'niche'].includes(tier);
}

/**
 * 标准化 tier 值
 */
export function normalizeTier(tier: string): BandTier {
  if (isValidTier(tier)) {
    return tier;
  }
  return 'niche';
}

/**
 * 标准化专辑列表
 */
export function normalizeAlbums(albums: string[]): string[] {
  if (!Array.isArray(albums)) {
    return [];
  }

  return albums
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map(a => a.trim())
    .slice(0, FIELD_LIMITS.albums.max);
}

/**
 * 标准化描述
 */
export function normalizeDescription(description: string, bandName: string, genres: string[], era?: string): string {
  if (!description || typeof description !== 'string') {
    if (era && era !== 'Unknown') {
      return DEFAULT_DESCRIPTION_TEMPLATES.withEra(bandName, genres, era);
    }
    return DEFAULT_DESCRIPTION_TEMPLATES.withoutEra(bandName, genres);
  }

  const trimmed = description.trim();

  if (trimmed.length < FIELD_LIMITS.description.min) {
    if (era && era !== 'Unknown') {
      return DEFAULT_DESCRIPTION_TEMPLATES.withEra(bandName, genres, era);
    }
    return DEFAULT_DESCRIPTION_TEMPLATES.withoutEra(bandName, genres);
  }

  if (trimmed.length > FIELD_LIMITS.description.max) {
    return trimmed.substring(0, FIELD_LIMITS.description.max - 3) + '...';
  }

  return trimmed;
}

/**
 * 标准化风格注释
 */
export function normalizeStyleNotes(styleNotes: string): string {
  if (!styleNotes || typeof styleNotes !== 'string') {
    return '';
  }

  const trimmed = styleNotes.trim();

  if (trimmed.length > FIELD_LIMITS.styleNotes.max) {
    return trimmed.substring(0, FIELD_LIMITS.styleNotes.max - 3) + '...';
  }

  return trimmed;
}

/**
 * 验证乐队名称
 */
export function isValidBandName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  const trimmed = name.trim();

  if (trimmed.length < FIELD_LIMITS.name.min || trimmed.length > FIELD_LIMITS.name.max) {
    return false;
  }

  // 检查是否包含非法字符
  if (/[<>\{\}\[\]]/.test(trimmed)) {
    return false;
  }

  return true;
}

/**
 * 完整的乐队数据验证和标准化
 */
export function validateAndNormalizeBand(
  data: Partial<Band>,
  primaryGenre: string
): { valid: boolean; band?: Band; errors: string[] } {
  const errors: string[] = [];

  // 验证名称
  if (!isValidBandName(data.name || '')) {
    errors.push('Invalid band name');
    return { valid: false, errors };
  }

  const name = data.name!.trim();

  // 标准化流派
  const genres = normalizeGenres(data.genre || [], primaryGenre);
  if (genres.length === 0) {
    errors.push('No valid genres provided');
    return { valid: false, errors };
  }

  // 标准化年代
  const era = normalizeEra(data.era || '');

  // 标准化专辑
  const albums = normalizeAlbums(data.albums || []);

  // 标准化描述
  const description = normalizeDescription(data.description || '', name, genres, era);

  // 标准化风格注释
  const styleNotes = normalizeStyleNotes(data.styleNotes || '');

  // 标准化 tier
  const tier = normalizeTier(data.tier || 'niche');

  const band: Band = {
    id: data.id || `band_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    name,
    genre: genres,
    era,
    albums,
    description,
    styleNotes,
    tier
  };

  return { valid: true, band, errors };
}

/**
 * 生成用于 LLM Prompt 的参考格式说明
 */
export function generateDataFormatReference(): string {
  return `DATA FORMAT REFERENCE:

BAND STRUCTURE:
{
  "name": "Band Name",                    // Required: 1-100 characters
  "genre": ["genre1", "genre2"],          // Required: 1-3 standard genres
  "era": "1980s-present",                 // Required: decade or year range
  "albums": ["Album 1", "Album 2"],       // Required: 1-5 notable albums
  "description": "Brief description...",  // Required: 10-500 characters
  "styleNotes": "Style evolution...",     // Optional: 0-200 characters
  "tier": "popular"                       // Required: well-known | popular | niche
}

STANDARD GENRES (use exactly as shown):
${STANDARD_GENRES.join(', ')}

ERA FORMATS (examples):
${ERA_EXAMPLES.join(', ')}

TIER DEFINITIONS:
- well-known: ${TIER_DEFINITIONS['well-known'].description}
  Examples: ${TIER_DEFINITIONS['well-known'].examples.join(', ')}
- popular: ${TIER_DEFINITIONS.popular.description}
  Examples: ${TIER_DEFINITIONS.popular.examples.join(', ')}
- niche: ${TIER_DEFINITIONS.niche.description}
  Examples: ${TIER_DEFINITIONS.niche.examples.join(', ')}`;
}
