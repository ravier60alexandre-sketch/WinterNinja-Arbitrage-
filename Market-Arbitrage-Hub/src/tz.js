const TIMEZONE = 'Europe/Paris';

function getParisTime(date) {
  const d = date || new Date();
  const s = d.toLocaleString('en-US', { timeZone: TIMEZONE });
  const p = new Date(s);
  return { hour: p.getHours(), dow: p.getDay() };
}

function formatParisClock(date) {
  const d = date || new Date();
  return d.toLocaleString('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

module.exports = { TIMEZONE, getParisTime, formatParisClock };
