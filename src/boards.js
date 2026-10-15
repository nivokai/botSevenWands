const { db, save } = require('./store');
const { dayKey, dayTitle, courseEnd, courseLine, chunkBlocks } = require('./format');

const EMOJI = process.env.PLANNING_EMOJI || '⌛';
const WINDOW = 7 * 24 * 3600;
const MESSAGE_LIMIT = 2000; // limite Discord pour le texte d'un message

// Toutes les mises à jour de messages passent par cette file pour éviter les éditions concurrentes
let chain = Promise.resolve();
function enqueue(fn) {
  const p = chain.then(fn);
  chain = p.catch((err) => console.error('[boards]', err));
  return p;
}

let lastPlanning = null;

async function fetchChannel(client, id) {
  if (!id) return null;
  try {
    return await client.channels.fetch(id);
  } catch {
    return null;
  }
}

/** Édite les messages existants, en envoie de nouveaux si besoin, supprime ceux en trop. Renvoie les nouveaux IDs. */
async function syncMessages(channel, ids, texts) {
  const newIds = [];
  for (let i = 0; i < texts.length; i++) {
    // Messages texte (pas d'embed) ; les mentions s'affichent sans notifier personne
    const payload = { content: texts[i], embeds: [], allowedMentions: { parse: [] } };

    let msg = null;
    if (ids[i]) msg = await channel.messages.fetch(ids[i]).catch(() => null);
    if (msg) await msg.edit(payload);
    else msg = await channel.send(payload);
    newIds.push(msg.id);
  }
  for (const id of ids.slice(texts.length)) {
    await channel.messages.delete(id).catch(() => null);
  }
  return newIds;
}

function renderPlanning() {
  const now = Math.floor(Date.now() / 1000);
  const courses = db.courses
    .filter((c) => courseEnd(c) > now && c.start < now + WINDOW)
    .sort((a, b) => a.start - b.start || a.id - b.id);

  const header = `## ${EMOJI} Emploi du Temps`;
  if (!courses.length) return [`${header}\n\nAucun cours en cours ou à venir dans les 7 prochains jours.`];

  const byDay = new Map();
  for (const c of courses) {
    const key = dayKey(c.start);
    if (!byDay.has(key)) byDay.set(key, []);
    const live = c.start <= now ? ' — 🟢 *En cours*' : '';
    byDay.get(key).push(courseLine(c) + live);
  }
  const blocks = [header];
  for (const [key, lines] of byDay) blocks.push(`### 📅 ${dayTitle(key)}\n${lines.join('\n')}`);
  return chunkBlocks(blocks, MESSAGE_LIMIT);
}

function refreshPlanning(client, { force = false } = {}) {
  return enqueue(async () => {
    const channel = await fetchChannel(client, db.config.planningChannelId);
    if (!channel) return;
    const texts = renderPlanning();
    const signature = JSON.stringify(texts);
    if (!force && signature === lastPlanning) return;
    db.config.planningMessageIds = await syncMessages(channel, db.config.planningMessageIds, texts);
    save();
    lastPlanning = signature;
  });
}

function renderHistoryDay(key) {
  const courses = db.courses
    .filter((c) => dayKey(c.start) === key)
    .sort((a, b) => a.start - b.start || a.id - b.id);
  if (!courses.length) return [];
  return chunkBlocks([`## 📜 ${dayTitle(key)}`, ...courses.map(courseLine)], MESSAGE_LIMIT);
}

/** Met à jour le message d'historique de chaque jour donné (crée / édite / supprime). */
function refreshHistory(client, keys) {
  return enqueue(async () => {
    const channel = await fetchChannel(client, db.config.historyChannelId);
    if (!channel) return;
    const sorted = [...new Set(keys)].sort();
    for (const key of sorted) {
      const ids = db.config.historyMessages[key] || [];
      const newIds = await syncMessages(channel, ids, renderHistoryDay(key));
      if (newIds.length) db.config.historyMessages[key] = newIds;
      else delete db.config.historyMessages[key];
      save();
    }
  });
}

function allHistoryKeys() {
  return [...new Set([...db.courses.map((c) => dayKey(c.start)), ...Object.keys(db.config.historyMessages)])];
}

module.exports = { refreshPlanning, refreshHistory, allHistoryKeys };
