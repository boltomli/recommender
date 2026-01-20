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

  console.log(`Checking: genre="${genre}", bandName="${bandName}"`);
  console.log(`  wellKnown: ${wellKnown.includes(bandName)}`);
  console.log(`  popular: ${popular.includes(bandName)}`);

  if (wellKnown.includes(bandName)) {
    return 'well-known';
  } else if (popular.includes(bandName)) {
    return 'popular';
  } else {
    return 'niche';
  }
}

// Test with a few bands
console.log(getBandTier('thrash', 'Metallica'));
console.log(getBandTier('thrash', 'Testament'));
console.log(getBandTier('thrash', 'Unknown Band'));