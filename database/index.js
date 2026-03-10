const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { runMigrations } = require('./migrations');

let db = null;
let statements = {};

function initDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  prepareStatements();

  console.log('[DB] Database initialized at', dbPath);
  return db;
}

function prepareStatements() {
  statements.insertObservation = db.prepare(`
    INSERT INTO spread_observations (
      timestamp, pair_a, pair_b,
      spread_1_raw, spread_1_bps, exec_size_1,
      spread_2_raw, spread_2_bps, exec_size_2,
      bid_a, ask_a, bid_size_a, ask_size_a,
      bid_b, ask_b, bid_size_b, ask_size_b
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statements.getObservations = db.prepare(`
    SELECT * FROM spread_observations
    WHERE pair_a = ? AND pair_b = ? AND timestamp >= ?
    ORDER BY timestamp ASC
    LIMIT ?
  `);

  statements.getRecentObservations = db.prepare(`
    SELECT * FROM spread_observations
    WHERE pair_a = ? AND pair_b = ? AND timestamp >= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  statements.getSpreadValues = db.prepare(`
    SELECT spread_1_bps, spread_2_bps, exec_size_1, exec_size_2, timestamp
    FROM spread_observations
    WHERE pair_a = ? AND pair_b = ? AND timestamp >= ?
    ORDER BY timestamp ASC
  `);

  statements.insertStats = db.prepare(`
    INSERT INTO rolling_stats (
      timestamp, pair_a, pair_b, window, direction,
      count, mean_spread_bps, median_spread_bps,
      p10_spread_bps, p90_spread_bps, stddev_spread_bps,
      max_spread_bps, min_spread_bps,
      edge_frequency, mean_reversion_score,
      mr_edge_frequency, amplitude_bps
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statements.getLatestStats = db.prepare(`
    SELECT * FROM rolling_stats
    WHERE pair_a = ? AND pair_b = ?
    ORDER BY timestamp DESC
    LIMIT 100
  `);

  statements.getLatestStatsForPair = db.prepare(`
    SELECT rs.* FROM rolling_stats rs
    INNER JOIN (
      SELECT pair_a, pair_b, window, direction, MAX(timestamp) as max_ts
      FROM rolling_stats
      WHERE pair_a = ? AND pair_b = ?
      GROUP BY window, direction
    ) latest ON rs.pair_a = latest.pair_a
      AND rs.pair_b = latest.pair_b
      AND rs.window = latest.window
      AND rs.direction = latest.direction
      AND rs.timestamp = latest.max_ts
  `);

  statements.deleteOldObservations = db.prepare(`
    DELETE FROM spread_observations WHERE timestamp < ?
  `);

  statements.deleteOldStats = db.prepare(`
    DELETE FROM rolling_stats WHERE timestamp < ?
  `);

  statements.getOldObservationsForOHLC = db.prepare(`
    SELECT pair_a, pair_b, timestamp, spread_1_bps, spread_2_bps
    FROM spread_observations
    WHERE timestamp < ?
    ORDER BY pair_a, pair_b, timestamp ASC
  `);

  statements.insertOHLC = db.prepare(`
    INSERT INTO spread_ohlc (timestamp, pair_a, pair_b, direction, open_bps, high_bps, low_bps, close_bps, mean_bps, count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statements.getLatestObservation = db.prepare(`
    SELECT * FROM spread_observations
    WHERE pair_a = ? AND pair_b = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);
}

function insertObservation(data) {
  try {
    statements.insertObservation.run(
      data.timestamp, data.pair_a, data.pair_b,
      data.spread_1_raw, data.spread_1_bps, data.exec_size_1,
      data.spread_2_raw, data.spread_2_bps, data.exec_size_2,
      data.bid_a, data.ask_a, data.bid_size_a, data.ask_size_a,
      data.bid_b, data.ask_b, data.bid_size_b, data.ask_size_b
    );
  } catch (err) {
    console.error('[DB] Insert error:', err.message);
  }
}

function getObservations(pairA, pairB, sinceTimestamp, limit = 500) {
  return statements.getObservations.all(pairA, pairB, sinceTimestamp, limit);
}

function getRecentObservations(pairA, pairB, sinceTimestamp, limit = 500) {
  return statements.getRecentObservations.all(pairA, pairB, sinceTimestamp, limit);
}

function getSpreadValues(pairA, pairB, sinceTimestamp) {
  return statements.getSpreadValues.all(pairA, pairB, sinceTimestamp);
}

function insertStats(data) {
  try {
    statements.insertStats.run(
      data.timestamp, data.pair_a, data.pair_b, data.window, data.direction,
      data.count, data.mean_spread_bps, data.median_spread_bps,
      data.p10_spread_bps, data.p90_spread_bps, data.stddev_spread_bps,
      data.max_spread_bps, data.min_spread_bps,
      data.edge_frequency, data.mean_reversion_score,
      data.mr_edge_frequency || null, data.amplitude_bps || null
    );
  } catch (err) {
    console.error('[DB] Stats insert error:', err.message);
  }
}

function getLatestStats(pairA, pairB) {
  return statements.getLatestStatsForPair.all(pairA, pairB);
}

function getLatestObservation(pairA, pairB) {
  return statements.getLatestObservation.get(pairA, pairB);
}

function runCleanup() {
  const now = Date.now();
  const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  try {
    // Downsample old tick data to 1-min OHLC before deleting
    const cutoff = fortyEightHoursAgo;
    const oldRows = statements.getOldObservationsForOHLC.all(cutoff);

    if (oldRows.length > 0) {
      const buckets = {};
      for (const row of oldRows) {
        const minuteTs = Math.floor(row.timestamp / 60000) * 60000;
        const key = `${row.pair_a}|${row.pair_b}|${minuteTs}`;
        if (!buckets[key]) {
          buckets[key] = { pair_a: row.pair_a, pair_b: row.pair_b, timestamp: minuteTs, d1: [], d2: [] };
        }
        buckets[key].d1.push(row.spread_1_bps);
        buckets[key].d2.push(row.spread_2_bps);
      }

      const insertOHLCTx = db.transaction((entries) => {
        for (const entry of entries) {
          for (const [dir, values] of [[1, entry.d1], [2, entry.d2]]) {
            if (values.length === 0) continue;
            statements.insertOHLC.run(
              entry.timestamp, entry.pair_a, entry.pair_b, dir,
              values[0], Math.max(...values), Math.min(...values),
              values[values.length - 1],
              values.reduce((a, b) => a + b, 0) / values.length,
              values.length
            );
          }
        }
      });
      insertOHLCTx(Object.values(buckets));
      console.log(`[DB] Downsampled ${oldRows.length} old observations to ${Object.keys(buckets).length} OHLC buckets`);
    }

    const deleted = statements.deleteOldObservations.run(fortyEightHoursAgo);
    if (deleted.changes > 0) {
      console.log(`[DB] Cleaned up ${deleted.changes} old observations`);
    }

    const deletedStats = statements.deleteOldStats.run(thirtyDaysAgo);
    if (deletedStats.changes > 0) {
      console.log(`[DB] Cleaned up ${deletedStats.changes} old stats`);
    }
  } catch (err) {
    console.error('[DB] Cleanup error:', err.message);
  }
}

function getDatabase() {
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

module.exports = {
  initDatabase,
  insertObservation,
  getObservations,
  getRecentObservations,
  getSpreadValues,
  insertStats,
  getLatestStats,
  getLatestObservation,
  runCleanup,
  getDatabase,
  close
};
