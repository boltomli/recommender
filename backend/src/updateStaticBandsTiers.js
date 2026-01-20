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
    'Tankard', 'Whiplash', 'Mercyful Fate', 'Death Angel', 'Dark Angel', 'Overkill',
    'Exodus', 'Testament', 'Kreator', 'Sodom', 'Destruction', 'Nuclear Assault',
    'Vio-lence', 'Death Angel', 'Flotsam and Jetsam', 'Heathen', 'Artillery',
    'Annihilator', 'Sacred Reich', 'Tankard', 'Whiplash', 'Rage', 'Running Wild',
    'Grave Digger', 'Mercyful Fate'
  ],
  death: [
    'Bolt Thrower', 'Benediction', 'Grave', 'Unleashed', 'Incantation',
    'Immolation', 'Angelcorpse', 'Krisiun', 'Hate Eternal', 'Origin', 'Brain Drill',
    'Necrophagist', 'Gorguts', 'Pestilence', 'Atheist', 'Cynic', 'Asphyx',
    'Paradise Lost', 'My Dying Bride', 'Type O Negative', 'Wormed', 'Portal',
    'Ulcerate', 'Bloodbath', 'Hypocrisy', 'Dismember', 'Entombed', 'Carcass',
    'Obituary', 'Deicide', 'Morbid Angel', 'Cannibal Corpse', 'Death'
  ],
  black: [
    'Watain', 'Naglfar', 'Shining', 'Silencer', 'Xasthur', 'Leviathan',
    'Drudkh', 'Agalloch', 'Wolves in the Throne Room', 'Altar of Plagues',
    'Deafheaven', 'Mgła', 'Uada', 'Gaahls Wyrd', 'Gorgoroth', 'Immortal',
    'Satyricon', 'Enslaved', 'Bathory', 'Marduk', 'Dissection', 'Emperor',
    'Darkthrone', 'Mayhem'
  ],
  power: [
    'Edguy', 'Sonata Arctica', 'Nightwish', 'Kamelot', 'Rage', 'Running Wild',
    'Grave Digger', 'Primal Fear', 'Freedom Call', 'Mob Rules', 'Masterplan',
    'Avantasia', 'Demons & Wizards', 'Iced Earth', 'Blind Guardian', 'Helloween',
    'Gamma Ray', 'Stratovarius', 'DragonForce', 'Powerwolf', 'Sabaton', 'HammerFall'
  ],
  doom: [
    'Sleep', 'Yob', 'Electric Wizard', 'Windhand', 'Pallbearer', 'Windhand',
    'Monolord', 'Reverend Bizarre', 'Solitude Aeturnus', 'While Heaven Wept',
    'Warning', '40 Watt Sun', 'Candlemass', 'Saint Vitus', 'Pentagram', 'Trouble',
    'Witchfinder General', 'Solitude Aeturnus', 'Cathedral', 'My Dying Bride',
    'Paradise Lost', 'Type O Negative'
  ],
  progressive: [
    'Caligula\'s Horse', 'Leprous', 'Haken', 'Caligula\'s Horse', 'Rivers of Nihil',
    'The Contortionist', 'Periphery', 'Tesseract', 'Between the Buried and Me',
    'Animals as Leaders', 'Plini', 'Intervals', 'Cloudkicker', 'Polyphia', 'Chon',
    'Mastodon', 'Devin Townsend', 'Porcupine Tree', 'Tool', 'Dream Theater',
    'Symphony X', 'Ayreon', 'Opeth'
  ],
  heavy: [
    'Manowar', 'Accept', 'Saxon', 'Running Wild', 'Grave Digger', 'Priest',
    'Mercyful Fate', 'King Diamond', 'Iron Maiden', 'Judas Priest', 'Black Sabbath',
    'Dio', 'Manowar', 'Accept', 'Saxon'
  ],
  speed: [
    'Exciter', 'Razor', 'Agent Steel', 'Helloween', 'Gamma Ray', 'Stratovarius',
    'DragonForce', 'Accept', 'Running Wild', 'Grave Digger', 'Overkill', 'Motörhead'
  ],
  groove: [
    'Sepultura', 'Machine Head', 'Lamb of God', 'Fear Factory', 'Devildriver',
    'Chimaira', 'Gojira', 'Mastodon', 'Static-X', 'Coal Chamber', 'Pantera',
    'Machine Head', 'Sepultura', 'Lamb of God'
  ],
  folk: [
    'Skyclad', 'Moonsorrow', 'Týr', 'Arkona', 'Heidevolk', 'Alestorm',
    'Wintersun', 'Korpiklaani', 'Ensiferum', 'Finntroll', 'Turisas', 'Eluveitie'
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

  // Find current genre and track it
  let currentGenre = null;
  const genrePattern = /^  (\w+): \[$/gm;

  // Replace band objects to add tier property
  const lines = content.split('\n');
  const updatedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect genre section
    const genreMatch = line.match(/^  (\w+): \[$/);
    if (genreMatch) {
      currentGenre = genreMatch[1];
      updatedLines.push(line);
      continue;
    }

    // Detect band object start
    if (line.trim().startsWith('{')) {
      // Look ahead to find the band name
      let bandName = null;
      let j = i;
      while (j < lines.length && !lines[j].trim().startsWith('}')) {
        const nameMatch = lines[j].match(/name: '([^']+)'/);
        if (nameMatch) {
          bandName = nameMatch[1];
          break;
        }
        j++;
      }

      if (bandName && currentGenre) {
        const tier = getBandTier(currentGenre, bandName);
        // Add tier property before the closing brace
        updatedLines.push(line);

        // Find the closing brace and add tier before it
        let k = i;
        while (k < lines.length && !lines[k].trim().startsWith('}')) {
          updatedLines.push(lines[k]);
          k++;
        }

        // Add tier property before closing brace
        const lastLine = updatedLines[updatedLines.length - 1];
        if (lastLine.trim().startsWith('}')) {
          updatedLines.pop();
          updatedLines.push(`      tier: '${tier}'`);
          updatedLines.push(lastLine);
        }

        i = k; // Skip to closing brace
        continue;
      }
    }

    updatedLines.push(line);
  }

  // Write updated content
  fs.writeFileSync(filePath, updatedLines.join('\n'));
  console.log(`Updated static bands file: ${filePath}`);

  // Print statistics
  const genreStats = {};
  const bandPattern = /name: '([^']+)'/g;
  let match;
  let currentGenreForStats = null;

  for (const line of updatedLines) {
    const genreMatch = line.match(/^  (\w+): \[$/);
    if (genreMatch) {
      currentGenreForStats = genreMatch[1];
      genreStats[currentGenreForStats] = { wellKnown: 0, popular: 0, niche: 0 };
      continue;
    }

    const tierMatch = line.match(/tier: '([^']+)'/);
    if (tierMatch && currentGenreForStats) {
      const tier = tierMatch[1];
      if (tier === 'well-known') genreStats[currentGenreForStats].wellKnown++;
      else if (tier === 'popular') genreStats[currentGenreForStats].popular++;
      else genreStats[currentGenreForStats].niche++;
    }
  }

  console.log('\nTier distribution:');
  for (const [genre, stats] of Object.entries(genreStats)) {
    const total = stats.wellKnown + stats.popular + stats.niche;
    console.log(`${genre}: ${stats.wellKnown} Tier 1, ${stats.popular} Tier 2, ${stats.niche} Tier 3 (Total: ${total})`);
  }
}

updateStaticBandsFile();