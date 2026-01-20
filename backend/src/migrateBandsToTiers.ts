import { Band, BandTier } from './types';
import { STATIC_BANDS } from './staticBands';
import fs from 'fs';
import path from 'path';

// Well-known bands by genre (Tier 1)
const WELL_KNOWN_BANDS: Record<string, string[]> = {
  thrash: [
    'Metallica',
    'Slayer',
    'Megadeth',
    'Anthrax',
    'Exodus',
    'Testament',
    'Kreator',
    'Sodom',
    'Destruction',
    'Overkill',
    'Death Angel',
    'Dark Angel'
  ],
  death: [
    'Death',
    'Cannibal Corpse',
    'Morbid Angel',
    'Obituary',
    'Deicide',
    'Suffocation',
    'Nile',
    'Carcass',
    'Entombed',
    'Dismember',
    'Autopsy',
    'Behemoth'
  ],
  black: [
    'Mayhem',
    'Darkthrone',
    'Emperor',
    'Cradle of Filth',
    'Dimmu Borgir',
    'Burzum',
    'Immortal',
    'Satyricon',
    'Enslaved',
    'Bathory',
    'Marduk',
    'Dissection'
  ],
  power: [
    'Blind Guardian',
    'Helloween',
    'Gamma Ray',
    'Stratovarius',
    'DragonForce',
    'Powerwolf',
    'Sabaton',
    'HammerFall',
    'Edguy',
    'Sonata Arctica',
    'Nightwish',
    'Kamelot'
  ],
  doom: [
    'Candlemass',
    'Saint Vitus',
    'Pentagram',
    'Trouble',
    'Witchfinder General',
    'Solitude Aeturnus',
    'Cathedral',
    'My Dying Bride',
    'Paradise Lost',
    'Type O Negative',
    'Electric Wizard',
    'Sleep'
  ],
  progressive: [
    'Opeth',
    'Dream Theater',
    'Tool',
    'Porcupine Tree',
    'Symphony X',
    'Ayreon',
    'Between the Buried and Me',
    'Mastodon',
    'Devin Townsend',
    'Leprous',
    'Haken',
    'Caligula\'s Horse'
  ],
  heavy: [
    'Iron Maiden',
    'Judas Priest',
    'Black Sabbath',
    'Dio',
    'Manowar',
    'Accept',
    'Saxon',
    'Running Wild',
    'Grave Digger',
    'Priest',
    'Mercyful Fate',
    'King Diamond'
  ],
  speed: [
    'Motörhead',
    'Exciter',
    'Razor',
    'Agent Steel',
    'Helloween',
    'Gamma Ray',
    'Stratovarius',
    'DragonForce',
    'Accept',
    'Running Wild',
    'Grave Digger',
    'Overkill'
  ],
  groove: [
    'Pantera',
    'Machine Head',
    'Sepultura',
    'Lamb of God',
    'Machine Head',
    'Fear Factory',
    'Devildriver',
    'Chimaira',
    'Gojira',
    'Mastodon',
    'Static-X',
    'Coal Chamber'
  ],
  folk: [
    'Eluveitie',
    'Turisas',
    'Finntroll',
    'Ensiferum',
    'Wintersun',
    'Korpiklaani',
    'Heidevolk',
    'Alestorm',
    'Skyclad',
    'Moonsorrow',
    'Týr',
    'Arkona'
  ]
};

// Popular bands by genre (Tier 2) - these are recognized within the metal community
const POPULAR_BANDS: Record<string, string[]> = {
  thrash: [
    'Rage',
    'Running Wild',
    'Grave Digger',
    'Annihilator',
    'Sacred Reich',
    'Nuclear Assault',
    'Vio-lence',
    'Flotsam and Jetsam',
    'Heathen',
    'Artillery',
    'Tankard',
    'Whiplash',
    'Mercyful Fate',
    'Death Angel',
    'Dark Angel',
    'Overkill',
    'Exodus',
    'Testament',
    'Kreator',
    'Sodom',
    'Destruction',
    'Nuclear Assault',
    'Vio-lence',
    'Death Angel',
    'Flotsam and Jetsam',
    'Heathen',
    'Artillery',
    'Annihilator',
    'Sacred Reich',
    'Tankard',
    'Whiplash',
    'Rage',
    'Running Wild',
    'Grave Digger',
    'Mercyful Fate'
  ],
  death: [
    'Bolt Thrower',
    'Benediction',
    'Grave',
    'Unleashed',
    'Incantation',
    'Immolation',
    'Angelcorpse',
    'Krisiun',
    'Hate Eternal',
    'Origin',
    'Brain Drill',
    'Necrophagist',
    'Gorguts',
    'Pestilence',
    'Atheist',
    'Cynic',
    'Asphyx',
    'Paradise Lost',
    'My Dying Bride',
    'Type O Negative',
    'Wormed',
    'Portal',
    'Ulcerate',
    'Bloodbath',
    'Hypocrisy',
    'Dismember',
    'Entombed',
    'Carcass',
    'Obituary',
    'Deicide',
    'Morbid Angel',
    'Cannibal Corpse',
    'Death'
  ],
  black: [
    'Watain',
    'Naglfar',
    'Shining',
    'Silencer',
    'Xasthur',
    'Leviathan',
    'Drudkh',
    'Agalloch',
    'Wolves in the Throne Room',
    'Altar of Plagues',
    'Deafheaven',
    'Mgła',
    'Uada',
    'Gaahls Wyrd',
    'Gorgoroth',
    'Immortal',
    'Satyricon',
    'Enslaved',
    'Bathory',
    'Marduk',
    'Dissection',
    'Emperor',
    'Darkthrone',
    'Mayhem'
  ],
  power: [
    'Edguy',
    'Sonata Arctica',
    'Nightwish',
    'Kamelot',
    'Rage',
    'Running Wild',
    'Grave Digger',
    'Primal Fear',
    'Freedom Call',
    'Mob Rules',
    'Masterplan',
    'Avantasia',
    'Demons & Wizards',
    'Iced Earth',
    'Blind Guardian',
    'Helloween',
    'Gamma Ray',
    'Stratovarius',
    'DragonForce',
    'Powerwolf',
    'Sabaton',
    'HammerFall'
  ],
  doom: [
    'Sleep',
    'Yob',
    'Electric Wizard',
    'Windhand',
    'Pallbearer',
    'Windhand',
    'Monolord',
    'Reverend Bizarre',
    'Solitude Aeturnus',
    'While Heaven Wept',
    'Warning',
    '40 Watt Sun',
    'Candlemass',
    'Saint Vitus',
    'Pentagram',
    'Trouble',
    'Witchfinder General',
    'Solitude Aeturnus',
    'Cathedral',
    'My Dying Bride',
    'Paradise Lost',
    'Type O Negative'
  ],
  progressive: [
    'Caligula\'s Horse',
    'Leprous',
    'Haken',
    'Caligula\'s Horse',
    'Rivers of Nihil',
    'The Contortionist',
    'Periphery',
    'Tesseract',
    'Between the Buried and Me',
    'Animals as Leaders',
    'Plini',
    'Intervals',
    'Cloudkicker',
    'Polyphia',
    'Chon',
    'Mastodon',
    'Devin Townsend',
    'Porcupine Tree',
    'Tool',
    'Dream Theater',
    'Symphony X',
    'Ayreon',
    'Opeth'
  ],
  heavy: [
    'Manowar',
    'Accept',
    'Saxon',
    'Running Wild',
    'Grave Digger',
    'Priest',
    'Mercyful Fate',
    'King Diamond',
    'Iron Maiden',
    'Judas Priest',
    'Black Sabbath',
    'Dio',
    'Manowar',
    'Accept',
    'Saxon'
  ],
  speed: [
    'Exciter',
    'Razor',
    'Agent Steel',
    'Helloween',
    'Gamma Ray',
    'Stratovarius',
    'DragonForce',
    'Accept',
    'Running Wild',
    'Grave Digger',
    'Overkill',
    'Motörhead'
  ],
  groove: [
    'Sepultura',
    'Machine Head',
    'Lamb of God',
    'Fear Factory',
    'Devildriver',
    'Chimaira',
    'Gojira',
    'Mastodon',
    'Static-X',
    'Coal Chamber',
    'Pantera',
    'Machine Head',
    'Sepultura',
    'Lamb of God'
  ],
  folk: [
    'Skyclad',
    'Moonsorrow',
    'Týr',
    'Arkona',
    'Heidevolk',
    'Alestorm',
    'Wintersun',
    'Korpiklaani',
    'Ensiferum',
    'Finntroll',
    'Turisas',
    'Eluveitie'
  ]
};

function getBandTier(genre: string, bandName: string): BandTier {
  const wellKnown = WELL_KNOWN_BANDS[genre] || [];
  const popular = POPULAR_BANDS[genre] || [];

  if (wellKnown.includes(bandName)) {
    return 'well-known';
  } else if (popular.includes(bandName)) {
    return 'popular';
  } else {
    return 'niche';
  }
}

function migrateBandsWithTiers(): Record<string, Band[]> {
  const migratedBands: Record<string, Band[]> = {};

  for (const [genre, bands] of Object.entries(STATIC_BANDS)) {
    migratedBands[genre] = bands.map(band => ({
      ...band,
      tier: getBandTier(genre, band.name)
    }));
  }

  return migratedBands;
}

function generateStaticBandsFile(): string {
  const migratedBands = migrateBandsWithTiers();

  let output = `import { Band } from './types';\n\n`;
  output += `export const STATIC_BANDS: Record<string, Band[]> = {\n`;

  for (const [genre, bands] of Object.entries(migratedBands)) {
    output += `  ${genre}: [\n`;
    for (const band of bands) {
      output += `    {\n`;
      output += `      id: '${band.id}',\n`;
      output += `      name: '${band.name}',\n`;
      output += `      genre: ${JSON.stringify(band.genre)},\n`;
      output += `      era: '${band.era}',\n`;
      output += `      albums: ${JSON.stringify(band.albums)},\n`;
      output += `      description: '${band.description.replace(/'/g, "\\'")}',\n`;
      output += `      styleNotes: '${(band.styleNotes || '').replace(/'/g, "\\'")}',\n`;
      output += `      tier: '${band.tier}'\n`;
      output += `    },\n`;
    }
    output += `  ],\n`;
  }

  output += `};\n`;

  return output;
}

async function main() {
  console.log('Migrating static bands to tiered system...');

  const migratedContent = generateStaticBandsFile();

  // Write to file
  const outputPath = path.join(__dirname, 'staticBands.ts');

  // Backup original file
  const backupPath = path.join(__dirname, 'staticBands.ts.backup');
  if (fs.existsSync(outputPath)) {
    fs.copyFileSync(outputPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  fs.writeFileSync(outputPath, migratedContent);

  console.log(`\nMigrated static bands file created: ${outputPath}`);

  // Print statistics
  const migratedBands = migrateBandsWithTiers();
  for (const [genre, bands] of Object.entries(migratedBands)) {
    const tier1Count = bands.filter(b => b.tier === 'well-known').length;
    const tier2Count = bands.filter(b => b.tier === 'popular').length;
    const tier3Count = bands.filter(b => b.tier === 'niche').length;

    console.log(`${genre}: ${tier1Count} Tier 1, ${tier2Count} Tier 2, ${tier3Count} Tier 3 (Total: ${bands.length})`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { migrateBandsWithTiers, getBandTier };