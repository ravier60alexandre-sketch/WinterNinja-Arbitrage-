const fs = require('fs');
const path = require('path');

const CURRENT_VERSION = 1;

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`);

  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  const currentVersion = row && row.v ? row.v : 0;

  if (currentVersion < 1) {
    console.log('[DB] Running migration v1: initial schema');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(1);
  }

  console.log(`[DB] Schema at version ${CURRENT_VERSION}`);
}

module.exports = { runMigrations, CURRENT_VERSION };
