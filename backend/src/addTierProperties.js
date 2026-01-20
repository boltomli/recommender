const fs = require('fs');
const path = require('path');

// Well-known bands by genre (Tier 1)
const WELL_KNOWN_BANDS = {
  thrash: [
    'Metallica', 'Slayer', 'Megadeth', 'Anthrax', 'Exodus', 'Testament',
    'Kreator', 'Sodom', 'Destruction', 'Overkill', 'Death Angel', 'Dark Angel'
  ],
  death: [
    'Death', 'Cannibal Corpse', 'Morbid Angel', 'Obituary', 'Deicide',
    'Suffocation', 'Nile', 'Carcass', 'Entombed', 'Dismember', 'Autopsy', 'Behemoth'
  ],
  black: [
    'Mayhem', 'Darkthrone', 'Emperor', 'Cradle of Filth', 'Dimmu Borgir',
    'Burzum', 'Immortal', 'Satyricon', 'Enslaved', 'Bathory', 'Marduk', 'Dissection'
  ],
  power: [
    'Blind Guardian', 'Helloween', 'Gamma Ray', 'Stratovarius', 'DragonForce',
    'Powerwolf', 'Sabaton', 'HammerFall', 'Edguy', 'Sonata Arctica', 'Nightwish', 'Kamelot'
  ],
  doom: [
    'Candlemass', 'Saint Vitus', 'Pentagram', 'Trouble', 'Witchfinder General',
    'Solitude Aeturnus', 'Cathedral', 'My Dying Bride', 'Paradise Lost', 'Type O Negative',
    'Electric Wizard', 'Sleep'
  ],
  progressive: [
    'Opeth', 'Dream Theater', 'Tool', 'Porcupine Tree', 'Symphony X',
    'Ayreon', 'Between the Buried and Me', 'Mastodon', 'Devin Townsend', 'Leprous',
    'Haken', 'Caligula\'s Horse'
  ],
  heavy: [
    'Iron Maiden', 'Judas Priest', 'Black Sabbath', 'Dio', 'Manowar',
    'Accept', 'Saxon', 'Running Wild', 'Grave Digger', 'Priest', 'Mercyful Fate', 'King Diamond'
  ],
  speed: [
    'Motörhead', 'Exciter', 'Razor', 'Agent Steel', 'Helloween', 'Gamma Ray',
    'Stratovarius', 'DragonForce', 'Accept', 'Running Wild', 'Grave Digger', 'Overkill'
  ],
  groove: [
    'Pantera', 'Machine Head', 'Sepultura', 'Lamb of God', 'Machine Head',
    'Fear Factory', 'Devildriver', 'Chimaira', 'Gojira', 'Mastodon', 'Static-X', 'Coal Chamber'
  ],
  folk: [
    'Eluveitie', 'Turisas', 'Finntroll', 'Ensiferum', 'Wintersun',
    'Korpiklaani', 'Heidevolk', 'Alestorm', 'Skyclad', 'Moonsorrow', 'Týr', 'Arkona'
  ]
};

// Popular bands by genre (Tier 2)
const POPULAR_BANDS = {
  thrash: [
    'Rage', 'Running Wild', 'Grave Digger', 'Annihilator', 'Sacred Reich',
    'Nuclear Assault', 'Vio-lence', 'Flotsam and Jetsam', 'Heathen', 'Artillery',
    'Tankard', 'Whiplash', 'Mercyful Fate'
  ],
  death: [
    'Bolt Thrower', 'Benediction', 'Grave', 'Unleashed', 'Incantation',
    'Immolation', 'Angelcorpse', 'Krisiun', 'Hate Eternal', 'Origin', 'Brain Drill',
    'Necrophagist', 'Gorguts', 'Pestilence', 'Atheist', 'Cynic', 'Asphyx',
    'Paradise Lost', 'My Dying Bride', 'Type O Negative', 'Wormed', 'Portal',
    'Ulcerate', 'Bloodbath', 'Hypocrisy'
  ],
  black: [
    'Watain', 'Naglfar', 'Shining', 'Silencer', 'Xasthur', 'Leviathan',
    'Drudkh', 'Agalloch', 'Wolves in the Throne Room', 'Altar of Plagues',
    'Deafheaven', 'Mgła', 'Uada', 'Gaahls Wyrd', 'Gorgoroth'
  ],
  power: [
    'Edguy', 'Sonata Arctica', 'Nightwish', 'Kamelot', 'Rage', 'Running Wild',
    'Grave Digger', 'Primal Fear', 'Freedom Call', 'Mob Rules', 'Masterplan',
    'Avantasia', 'Demons & Wizards', 'Iced Earth'
  ],
  doom: [
    'Sleep', 'Yob', 'Electric Wizard', 'Windhand', 'Pallbearer',
    'Monolord', 'Reverend Bizarre', 'Solitude Aeturnus', 'While Heaven Wept',
    'Warning', '40 Watt Sun'
  ],
  progressive: [
    'Caligula\'s Horse', 'Leprous', 'Haken', 'Rivers of Nihil',
    'The Contortionist', 'Periphery', 'Tesseract', 'Animals as Leaders',
    'Plini', 'Intervals', 'Cloudkicker', 'Polyphia', 'Chon'
  ],
  heavy: [
    'Manowar', 'Accept', 'Saxon', 'Running Wild', 'Grave Digger', 'Priest',
    'Mercyful Fate', 'King Diamond'
  ],
  speed: [
    'Exciter', 'Razor', 'Agent Steel', 'Helloween', 'Gamma Ray', 'Stratovarius',
    'DragonForce', 'Accept', 'Running Wild', 'Grave Digger'
  ],
  groove: [
    'Sepultura', 'Machine Head', 'Lamb of God', 'Fear Factory', 'Devildriver',
    'Chimaira', 'Gojira', 'Mastodon', 'Static-X', 'Coal Chamber'
  ],
  folk: [
    'Skyclad', 'Moonsorrow', 'Týr', 'Arkona', 'Heidevolk', 'Alestorm',
    'Wintersun', 'Korpiklaani', 'Ensiferum', 'Finntroll', 'Turisas'
  ]
};

function getBandTier(genre, bandName) {
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

function updateStaticBandsFile() {
  const filePath = path.join(__dirname, 'staticBands.ts');
  const backupPath = path.join(__dirname, 'staticBands.ts.backup');

  // Read the file
  let content = fs.readFileSync(filePath, 'utf-8');

  // Create backup
  fs.copyFileSync(filePath, backupPath);
  console.log(`Backup created: ${backupPath}`);

  // Build a replacement map
  const replacements = [];

  // Find all band entries
  const bandPattern = /(\s+id: 'band_[^']+',\s+name: '([^']+)',)/g;
  let match;
  let currentGenre = null;

  // First, find the genre for each band
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const genreMatch = line.match(/^  (\w+): \[$/);
    if (genreMatch) {
      currentGenre = genreMatch[1];
      continue;
    }

    const nameMatch = line.match(/name: '([^']+)'/);
    if (nameMatch && currentGenre) {
      const bandName = nameMatch[1];
      const tier = getBandTier(currentGenre, bandName);

      // Find the styleNotes line for this band
      let j = i;
      while (j < lines.length && !lines[j].trim().startsWith('}')) {
        if (lines[j].includes('styleNotes')) {
          // Add tier after styleNotes
          const indent = lines[j].match(/^(\s*)/)[1];
          replacements.push({
            search: lines[j],
            replace: lines[j] + '\n' + indent + `tier: '${tier}'`
          });
          break;
        }
        j++;
      }
    }
  }

  // Apply replacements
  for (const replacement of replacements) {
    content = content.replace(replacement.search, replacement.replace);
  }

  // Write updated content
  fs.writeFileSync(filePath, content);
  console.log(`Updated static bands file: ${filePath}`);

  // Count tiers
  const tierCounts = { 'well-known': 0, 'popular': 0, 'niche': 0 };
  const tierPattern = /tier: '([^']+)'/g;
  while ((match = tierPattern.exec(content)) !== null) {
    tierCounts[match[1]]++;
  }

  console.log('\nTotal tier distribution:');
  console.log(`Tier 1 (well-known): ${tierCounts['well-known']}`);
  console.log(`Tier 2 (popular): ${tierCounts['popular']}`);
  console.log(`Tier 3 (niche): ${tierCounts['niche']}`);
  console.log(`Total: ${tierCounts['well-known'] + tierCounts['popular'] + tierCounts['niche']}`);
}

updateStaticBandsFile();