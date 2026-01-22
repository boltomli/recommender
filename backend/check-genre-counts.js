const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data/bands.db'));
const bands = db.prepare('SELECT * FROM bands').all();

const genreCounts = {};

bands.forEach(band => {
  const genres = JSON.parse(band.genre);
  genres.forEach(g => {
    genreCounts[g] = (genreCounts[g] || 0) + 1;
  });
});

console.log('Genre counts (sorted by count):');
Object.entries(genreCounts)
  .sort((a, b) => a[1] - b[1])
  .forEach(([genre, count]) => {
    console.log(`  ${genre}: ${count}`);
  });

db.close();