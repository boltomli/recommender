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
  const content = fs.readFileSync(filePath, 'utf-8');

  // Create backup
  fs.copyFileSync(filePath, backupPath);
  console.log(`Backup created: ${backupPath}`);

  const lines = content.split('\n');
  const updatedLines = [];
  let currentGenre = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect genre section
    const genreMatch = line.match(/^  (\w+): \[$/);
    if (genreMatch) {
      currentGenre = genreMatch[1];
      console.log(`Processing genre: ${currentGenre}`);
      updatedLines.push(line);
      i++;
      continue;
    }

    // Detect band object start
    if (trimmed.startsWith('{')) {
      // Find the entire band object
      let bandLines = [line];
      let j = i + 1;
      let bandName = null;
      let hasTier = false;

      // Read until we find the closing brace
      while (j < lines.length) {
        bandLines.push(lines[j]);

        // Check for band name
        const nameMatch = lines[j].match(/name: '([^']+)'/);
        if (nameMatch) {
          bandName = nameMatch[1];
        }

        // Check if tier already exists
        if (lines[j].includes('tier:')) {
          hasTier = true;
        }

        if (lines[j].trim().startsWith('}')) {
          break;
        }
        j++;
      }

      // Add tier if not present
      if (!hasTier && bandName && currentGenre) {
        const tier = getBandTier(currentGenre, bandName);
        console.log(`  Band: ${bandName} -> ${tier}`);

        // Find the line before the closing brace
        const lastLineIndex = bandLines.length - 1;
        const secondToLastLine = bandLines[lastLineIndex - 1];
        const indent = secondToLastLine.match(/^(\s*)/)[1];

        // Check if second to last line ends with comma
        if (secondToLastLine.trim().endsWith(',')) {
          // Insert tier before closing brace
          bandLines.splice(lastLineIndex, 0, `${indent}tier: '${tier}'`);
        } else {
          // Add comma to second to last line and insert tier
          bandLines[lastLineIndex - 1] = secondToLastLine + ',';
          bandLines.splice(lastLineIndex, 0, `${indent}tier: '${tier}'`);
        }
      }

      updatedLines.push(...bandLines);
      i = j + 1;
      continue;
    }

    updatedLines.push(line);
    i++;
  }

  // Write updated content
  fs.writeFileSync(filePath, updatedLines.join('\n'));
  console.log(`\nUpdated static bands file: ${filePath}`);

  // Count tiers
  const tierCounts = { 'well-known': 0, 'popular': 0, 'niche': 0 };
  const tierPattern = /tier: '([^']+)'/g;
  let match;
  while ((match = tierPattern.exec(updatedLines.join('\n'))) !== null) {
    tierCounts[match[1]]++;
  }

  console.log('\nTotal tier distribution:');
  console.log(`Tier 1 (well-known): ${tierCounts['well-known']}`);
  console.log(`Tier 2 (popular): ${tierCounts['popular']}`);
  console.log(`Tier 3 (niche): ${tierCounts['niche']}`);
  console.log(`Total: ${tierCounts['well-known'] + tierCounts['popular'] + tierCounts['niche']}`);
}

updateStaticBandsFile();
