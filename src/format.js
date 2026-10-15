const { DateTime } = require('luxon');

const TZ = 'Europe/Paris';
const EMBED_LIMIT = 4000; // limite Discord : 4096 caractères par description d'embed
const COLOR = 0x8e44ad;

// Clé = valeur stockée, label = texte affiché devant l'intitulé : "Sort (Flamette)"
const MATIERES = {
  SORTS: { name: 'SORTS', label: 'Sort' },
  POTIONS: { name: 'POTIONS', label: 'Potion' },
  HDM: { name: 'HDM', label: 'HDM' },
  CREATURES: { name: 'CREATURES MAGIQUES', label: 'Créature Magique' },
  ALCHIMIE: { name: 'ALCHIMIE - BOTANIQUE', label: 'Alchimie-Botanique' },
  DIVERS: { name: 'DIVERS', label: 'Divers' },
  CLUBS: { name: 'CLUBS', label: 'Club' },
};

const ANNEES = [1, 2, 3, 4, 5, 6, 7];

function matiereLabel(key) {
  return MATIERES[key]?.label ?? key;
}

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/** Retrouve la clé de matière depuis son libellé ou son nom ("Créature Magique", "creatures magiques"...). */
function matiereFromLabel(text) {
  const n = norm(text);
  if (!n) return null;
  for (const [key, m] of Object.entries(MATIERES)) {
    if ([key, m.name, m.label].some((x) => norm(x) === n)) return key;
  }
  return null;
}

/**
 * Découpe "Sort (Flamette)" -> { matiere: 'SORTS', intitule: 'Flamette' }.
 * Sans préfixe de matière reconnu, renvoie { matiere: null, intitule: texte }.
 */
function parseIntitule(text) {
  const t = text.trim();
  const m = t.match(/^([^()]+?)\s*\((.*)\)$/);
  if (m) {
    const matiere = matiereFromLabel(m[1]);
    if (matiere) return { matiere, intitule: m[2].trim() };
  }
  return { matiere: null, intitule: t };
}

function anneeLabel(n) {
  return n === 1 ? '1ère' : `${n}ème`;
}

function dureeLabel(min) {
  if (min < 60) return `${min}mins`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function capitalizeWords(s) {
  return s.replace(/(^|\s)(\S)/g, (_, sp, ch) => sp + ch.toUpperCase());
}

function dayKey(ts) {
  return DateTime.fromSeconds(ts, { zone: TZ }).toISODate();
}

function dayTitle(key) {
  return capitalizeWords(DateTime.fromISO(key, { zone: TZ }).setLocale('fr').toFormat('cccc d LLLL'));
}

function courseEnd(c) {
  return c.start + c.duree * 60;
}

function courseTitle(c) {
  return `${matiereLabel(c.matiere)} (${c.intitule})`;
}

function courseLine(c) {
  return `- [${c.id}] <t:${c.start}:t> à <t:${courseEnd(c)}:t> (*${dureeLabel(c.duree)}*) - **${courseTitle(c)}** - Salle: **${c.salle}** - Année: **${anneeLabel(c.annee)}** par <@${c.createur}>`;
}

/**
 * Accepte : "09/10/2026 14:20", "9/10 14h20", "9-10-26 14h", "14:20" (aujourd'hui),
 * "demain 14h20", "aujourd'hui 20h". Heure de Paris.
 */
function parseDateTime(input) {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ à /g, ' ');
  const now = DateTime.now().setZone(TZ);
  const time = '(\\d{1,2})\\s*[h:]\\s*(\\d{2})?';

  let m = s.match(new RegExp(`^(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?\\s*${time}$`));
  if (m) {
    const [, d, mo, y, h, mi] = m;
    const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : now.year;
    let dt = DateTime.fromObject(
      { year, month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi || 0) },
      { zone: TZ },
    );
    if (!dt.isValid) return null;
    // Sans année et date déjà passée depuis longtemps : on suppose l'année suivante
    if (!y && dt < now.minus({ months: 1 })) dt = dt.plus({ years: 1 });
    return dt;
  }

  m = s.match(new RegExp(`^(?:(aujourd'hui|auj|demain|apres-demain|après-demain)\\s*)?${time}$`));
  if (m) {
    const [, word, h, mi] = m;
    const offset = !word || word.startsWith('auj') ? 0 : word === 'demain' ? 1 : 2;
    const dt = now.plus({ days: offset }).set({ hour: Number(h), minute: Number(mi || 0), second: 0, millisecond: 0 });
    return dt.isValid ? dt : null;
  }
  return null;
}

function formatDateTime(dt) {
  return capitalizeWords(dt.setLocale('fr').toFormat('cccc d LLLL yyyy')) + ' à ' + dt.toFormat('HH:mm');
}

/** Regroupe des blocs de texte en morceaux <= EMBED_LIMIT (un bloc trop long est coupé par lignes). */
function chunkBlocks(blocks, limit = EMBED_LIMIT) {
  const chunks = [];
  let current = '';
  const push = (piece) => {
    const sep = current ? '\n' : '';
    if (current.length + sep.length + piece.length > limit) {
      if (current) chunks.push(current);
      current = piece.slice(0, limit);
    } else {
      current += sep + piece;
    }
  };
  for (const block of blocks) {
    if (block.length <= limit) push(block);
    else for (const line of block.split('\n')) push(line);
  }
  if (current) chunks.push(current);
  return chunks;
}

module.exports = {
  TZ,
  COLOR,
  MATIERES,
  ANNEES,
  matiereLabel,
  parseIntitule,
  anneeLabel,
  dureeLabel,
  dayKey,
  dayTitle,
  courseEnd,
  courseTitle,
  courseLine,
  parseDateTime,
  formatDateTime,
  chunkBlocks,
};
