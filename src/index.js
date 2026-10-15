require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { DateTime } = require('luxon');
const store = require('./store');
const { db, save } = store;
const {
  TZ,
  COLOR,
  MATIERES,
  matiereLabel,
  parseIntitule,
  anneeLabel,
  dureeLabel,
  dayKey,
  courseEnd,
  courseTitle,
  courseLine,
  parseDateTime,
  formatDateTime,
  chunkBlocks,
} = require('./format');
const { refreshPlanning, refreshHistory, allHistoryKeys } = require('./boards');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const EPHEMERAL = { flags: MessageFlags.Ephemeral };

// ---------- Permissions ----------

// On travaille sur l'interaction : i.member peut être un objet brut de l'API (serveur non mis en cache)
function isAdmin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function hasRole(i, roleId) {
  const roles = i.member?.roles;
  if (Array.isArray(roles)) return roles.includes(roleId);
  return roles?.cache?.has(roleId) ?? false;
}

function canCreate(i) {
  if (isAdmin(i)) return true;
  if (!db.config.profRoleId) return true;
  return hasRole(i, db.config.profRoleId);
}

// Admins et rôle staff : peuvent gérer les cours de tout le monde
function isStaff(i) {
  return isAdmin(i) || (!!db.config.staffRoleId && hasRole(i, db.config.staffRoleId));
}

function canEdit(i, course) {
  return isStaff(i) || course.createur === i.user.id;
}

// ---------- Helpers ----------

function refreshAll(keys) {
  refreshPlanning(client).catch(() => null);
  if (keys?.length) refreshHistory(client, keys).catch(() => null);
}

function courseEmbed(c, title) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(courseLine(c))
    .addFields(
      { name: 'Début', value: `<t:${c.start}:F> (<t:${c.start}:R>)`, inline: false },
      { name: 'Durée', value: dureeLabel(c.duree), inline: true },
      { name: 'Salle', value: c.salle, inline: true },
      { name: 'Année', value: anneeLabel(c.annee), inline: true },
    );
}

function resolveSalle(input) {
  return store.findSalle(input);
}

// ---------- /cours ----------

async function coursAjouter(i) {
  if (!canCreate(i)) return i.reply({ content: "❌ Vous n'avez pas le rôle requis pour créer un cours.", ...EPHEMERAL });

  const salle = resolveSalle(i.options.getString('salle'));
  if (!salle) return i.reply({ content: '❌ Salle inconnue. Choisissez une salle dans la liste (ou ajoutez-la avec `/salle ajouter`).', ...EPHEMERAL });

  const dt = parseDateTime(i.options.getString('datetime'));
  if (!dt) return i.reply({ content: '❌ Date invalide. Format attendu : `JJ/MM/AAAA HH:MM` (ex: `09/10/2026 14:20`).', ...EPHEMERAL });

  // "Sort (Flamette)" choisi dans les suggestions -> on garde "Flamette" ; la matière du préfixe l'emporte
  const parsed = parseIntitule(i.options.getString('intitule'));
  if (!parsed.intitule) return i.reply({ content: '❌ Intitulé vide.', ...EPHEMERAL });

  const c = store.addCourse({
    matiere: parsed.matiere ?? i.options.getString('matiere'),
    intitule: parsed.intitule,
    salle,
    start: Math.floor(dt.toSeconds()),
    duree: i.options.getInteger('duree'),
    annee: i.options.getInteger('annee'),
    createur: i.user.id,
  });

  await i.reply({ embeds: [courseEmbed(c, `✅ Cours #${c.id} ajouté`)], ...EPHEMERAL });
  refreshAll([dayKey(c.start)]);
}

async function coursModifier(i) {
  const c = store.getCourse(i.options.getInteger('id'));
  if (!c) return i.reply({ content: '❌ Cours introuvable.', ...EPHEMERAL });
  if (!canEdit(i, c)) return i.reply({ content: '❌ Vous ne pouvez modifier que vos propres cours.', ...EPHEMERAL });

  const oldKey = dayKey(c.start);
  const updates = {};

  const salleInput = i.options.getString('salle');
  if (salleInput) {
    updates.salle = resolveSalle(salleInput);
    if (!updates.salle) return i.reply({ content: '❌ Salle inconnue.', ...EPHEMERAL });
  }
  const dtInput = i.options.getString('datetime');
  if (dtInput) {
    const dt = parseDateTime(dtInput);
    if (!dt) return i.reply({ content: '❌ Date invalide. Format attendu : `JJ/MM/AAAA HH:MM`.', ...EPHEMERAL });
    updates.start = Math.floor(dt.toSeconds());
  }
  const matiere = i.options.getString('matiere');
  if (matiere) updates.matiere = matiere;
  const intitule = i.options.getString('intitule');
  if (intitule) {
    const parsed = parseIntitule(intitule);
    if (parsed.intitule) updates.intitule = parsed.intitule;
    if (parsed.matiere) updates.matiere = parsed.matiere;
  }
  const duree = i.options.getInteger('duree');
  if (duree) updates.duree = duree;
  const annee = i.options.getInteger('annee');
  if (annee) updates.annee = annee;

  if (!Object.keys(updates).length) return i.reply({ content: 'ℹ️ Aucune modification fournie.', ...EPHEMERAL });

  Object.assign(c, updates);
  save();
  await i.reply({ embeds: [courseEmbed(c, `✏️ Cours #${c.id} modifié`)], ...EPHEMERAL });
  refreshAll([oldKey, dayKey(c.start)]);
}

async function coursSupprimer(i) {
  const c = store.getCourse(i.options.getInteger('id'));
  if (!c) return i.reply({ content: '❌ Cours introuvable.', ...EPHEMERAL });
  if (!canEdit(i, c)) return i.reply({ content: '❌ Vous ne pouvez supprimer que vos propres cours.', ...EPHEMERAL });

  store.removeCourse(c.id);
  await i.reply({ content: `🗑️ Cours #${c.id} **${courseTitle(c)}** supprimé.`, ...EPHEMERAL });
  refreshAll([dayKey(c.start)]);
}

async function coursListe(i) {
  const now = Math.floor(Date.now() / 1000);
  const withPast = i.options.getBoolean('passes') ?? false;
  const user = i.options.getUser('createur');
  const from = withPast ? now - 30 * 24 * 3600 : now;

  const courses = db.courses
    .filter((c) => courseEnd(c) > from && (!user || c.createur === user.id))
    .sort((a, b) => a.start - b.start || a.id - b.id);

  if (!courses.length) return i.reply({ content: 'Aucun cours trouvé.', ...EPHEMERAL });

  const blocks = [];
  let currentDay = null;
  for (const c of courses) {
    const key = dayKey(c.start);
    if (key !== currentDay) {
      currentDay = key;
      blocks.push(`### ${DateTime.fromISO(key, { zone: TZ }).setLocale('fr').toFormat('cccc d LLLL yyyy')}`);
    }
    blocks.push(courseLine(c));
  }
  const chunks = chunkBlocks(blocks, 3900);
  // Une réponse = 10 embeds max et 6000 caractères au total : on envoie en plusieurs messages si besoin
  await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`📚 ${courses.length} cours`).setDescription(chunks[0])], ...EPHEMERAL });
  for (const chunk of chunks.slice(1, 10)) {
    await i.followUp({ embeds: [new EmbedBuilder().setColor(COLOR).setDescription(chunk)], ...EPHEMERAL });
  }
}

async function coursActualiser(i) {
  if (!canCreate(i)) return i.reply({ content: '❌ Permission refusée.', ...EPHEMERAL });
  await i.deferReply(EPHEMERAL);
  await refreshPlanning(client, { force: true });
  await refreshHistory(client, allHistoryKeys());
  await i.editReply('✅ Emploi du temps et historique actualisés.');
}

// ---------- /stats ----------

async function statsCreateur(i) {
  const user = i.options.getUser('utilisateur') ?? i.user;
  const now = Math.floor(Date.now() / 1000);
  const list = db.courses.filter((c) => c.createur === user.id).sort((a, b) => a.start - b.start);

  if (!list.length) return i.reply({ content: `${user} n'a créé aucun cours.`, allowedMentions: { parse: [] }, ...EPHEMERAL });

  const totalMin = list.reduce((s, c) => s + c.duree, 0);
  const done = list.filter((c) => courseEnd(c) <= now);
  const upcoming = list.filter((c) => courseEnd(c) > now);

  const count = (fn) => {
    const m = new Map();
    for (const c of list) m.set(fn(c), (m.get(fn(c)) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byMatiere = count((c) => matiereLabel(c.matiere)).map(([k, v]) => `**${k}** : ${v}`).join('\n');
  const byAnnee = count((c) => c.annee)
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `**${anneeLabel(k)}** : ${v}`)
    .join('\n');
  const bySalle = count((c) => c.salle).slice(0, 5).map(([k, v]) => `**${k}** : ${v}`).join('\n');

  const fmt = (c) => `[${c.id}] **${courseTitle(c)}** — <t:${c.start}:f>`;
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: user.displayName ?? user.username, iconURL: user.displayAvatarURL() })
    .setTitle('📊 Statistiques créateur')
    .addFields(
      { name: 'Cours créés', value: String(list.length), inline: true },
      { name: 'Donnés', value: String(done.length), inline: true },
      { name: 'À venir', value: String(upcoming.length), inline: true },
      { name: 'Temps total', value: dureeLabel(totalMin), inline: true },
      { name: 'Durée moyenne', value: dureeLabel(Math.round(totalMin / list.length)), inline: true },
      { name: '​', value: '​', inline: true },
      { name: 'Par matière', value: byMatiere || '—', inline: true },
      { name: 'Par année', value: byAnnee || '—', inline: true },
      { name: 'Salles favorites', value: bySalle || '—', inline: true },
      { name: 'Premier cours', value: fmt(list[0]) },
      { name: 'Dernier cours donné', value: done.length ? fmt(done[done.length - 1]) : '—' },
      { name: 'Prochain cours', value: upcoming.length ? fmt(upcoming[0]) : '—' },
    );
  await i.reply({ embeds: [embed], ...EPHEMERAL });
}

// ---------- /salle ----------

async function salleAjouter(i) {
  if (!isAdmin(i)) return i.reply({ content: '❌ Il faut la permission « Gérer le serveur ».', ...EPHEMERAL });
  const nom = i.options.getString('nom').trim();
  if (store.findSalle(nom)) return i.reply({ content: `ℹ️ La salle **${nom}** existe déjà.`, ...EPHEMERAL });
  db.salles.push(nom);
  db.salles.sort((a, b) => a.localeCompare(b, 'fr'));
  save();
  await i.reply({ content: `✅ Salle **${nom}** ajoutée.`, ...EPHEMERAL });
}

async function salleSupprimer(i) {
  if (!isAdmin(i)) return i.reply({ content: '❌ Il faut la permission « Gérer le serveur ».', ...EPHEMERAL });
  const nom = store.findSalle(i.options.getString('nom'));
  if (!nom) return i.reply({ content: '❌ Salle introuvable.', ...EPHEMERAL });
  db.salles = db.salles.filter((s) => s !== nom);
  save();
  await i.reply({ content: `🗑️ Salle **${nom}** supprimée (les cours existants la gardent).`, ...EPHEMERAL });
}

async function salleListe(i) {
  if (!db.salles.length) return i.reply({ content: 'Aucune salle. Ajoutez-en avec `/salle ajouter`.', ...EPHEMERAL });
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🏰 Salles (${db.salles.length})`)
    .setDescription(chunkBlocks(db.salles.map((s) => `- ${s}`))[0]);
  await i.reply({ embeds: [embed], ...EPHEMERAL });
}

// ---------- /config ----------

async function configPlanning(i) {
  const channel = i.options.getChannel('salon');
  db.config.planningChannelId = channel.id;
  db.config.planningMessageIds = [];
  save();
  await i.deferReply(EPHEMERAL);
  await refreshPlanning(client, { force: true });
  await i.editReply(`✅ L'emploi du temps sera affiché dans ${channel}.`);
}

async function configHistorique(i) {
  const channel = i.options.getChannel('salon');
  db.config.historyChannelId = channel.id;
  db.config.historyMessages = {};
  save();
  await i.deferReply(EPHEMERAL);
  await refreshHistory(client, allHistoryKeys());
  await i.editReply(`✅ L'historique sera publié dans ${channel}.`);
}

async function configRole(i) {
  const role = i.options.getRole('role');
  db.config.profRoleId = role?.id ?? null;
  save();
  await i.reply({
    content: role ? `✅ Seuls les membres avec ${role} (et les admins) peuvent créer des cours.` : '✅ Tout le monde peut créer des cours.',
    allowedMentions: { parse: [] },
    ...EPHEMERAL,
  });
}

async function configStaff(i) {
  const role = i.options.getRole('role');
  db.config.staffRoleId = role?.id ?? null;
  save();
  await i.reply({
    content: role
      ? `✅ Les membres avec ${role} (et les admins) peuvent modifier et supprimer tous les cours.`
      : '✅ Seuls les admins peuvent modifier et supprimer les cours des autres.',
    allowedMentions: { parse: [] },
    ...EPHEMERAL,
  });
}

async function configVoir(i) {
  const { planningChannelId, historyChannelId, profRoleId, staffRoleId } = db.config;
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('⚙️ Configuration')
    .addFields(
      { name: 'Salon emploi du temps', value: planningChannelId ? `<#${planningChannelId}>` : 'Non défini' },
      { name: 'Salon historique', value: historyChannelId ? `<#${historyChannelId}>` : 'Non défini' },
      { name: 'Rôle prof', value: profRoleId ? `<@&${profRoleId}>` : 'Tout le monde' },
      { name: 'Rôle staff', value: staffRoleId ? `<@&${staffRoleId}>` : 'Admins seulement' },
      { name: 'Prochain numéro de cours', value: String(db.nextId) },
      { name: 'Salles', value: String(db.salles.length), inline: true },
      { name: 'Cours enregistrés', value: String(db.courses.length), inline: true },
    );
  await i.reply({ embeds: [embed], ...EPHEMERAL });
}

// ---------- Autocomplete ----------

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function autocomplete(i) {
  const focused = i.options.getFocused(true);
  const query = norm(String(focused.value ?? ''));

  if (focused.name === 'intitule') {
    const typed = parseIntitule(String(focused.value ?? ''));
    const text = typed.intitule;
    // Matière : celle déjà choisie dans la commande, sinon celle du cours modifié, sinon le préfixe tapé
    let matiere = i.options.getString('matiere') || typed.matiere;
    if (!matiere && i.options.getSubcommand(false) === 'modifier') {
      matiere = store.getCourse(Number(i.options.get('id')?.value))?.matiere ?? null;
    }
    const keys = matiere ? [matiere] : Object.keys(MATIERES);
    const fmt = (key, t) => `${matiereLabel(key)} (${t})`.slice(0, 100);

    const seen = new Set();
    const choices = [];
    const add = (key, t) => {
      const name = fmt(key, t);
      if (seen.has(name) || choices.length >= 25) return;
      seen.add(name);
      choices.push({ name, value: name });
    };
    // 1) Ce qui est en train d'être tapé, préfixé par la/les matière(s)
    for (const key of keys) add(key, text);
    // 2) Intitulés déjà utilisés qui correspondent (les plus récents d'abord)
    const q = norm(text);
    [...db.courses]
      .sort((a, b) => b.start - a.start)
      .filter((c) => keys.includes(c.matiere) && (!q || norm(c.intitule).includes(q)))
      .forEach((c) => add(c.matiere, c.intitule));
    return i.respond(choices);
  }

  if (focused.name === 'salle' || focused.name === 'nom') {
    const choices = db.salles.filter((s) => norm(s).includes(query)).slice(0, 25);
    return i.respond(choices.map((s) => ({ name: s, value: s })));
  }

  if (focused.name === 'datetime') {
    const raw = String(focused.value ?? '').trim();
    if (!raw) {
      const now = DateTime.now().setZone(TZ);
      const ex = now.plus({ hours: 1 }).startOf('hour');
      return i.respond([
        { name: `Ex: ${ex.toFormat('dd/MM/yyyy HH:mm')}`, value: ex.toFormat('dd/MM/yyyy HH:mm') },
      ]);
    }
    const dt = parseDateTime(raw);
    const value = raw.slice(0, 100);
    return i.respond([
      dt
        ? { name: `✅ ${formatDateTime(dt)}`.slice(0, 100), value: dt.toFormat('dd/MM/yyyy HH:mm') }
        : { name: '❌ Format : JJ/MM/AAAA HH:MM (ex: 09/10/2026 14:20)', value },
    ]);
  }

  if (focused.name === 'id') {
    const now = Math.floor(Date.now() / 1000);
    const admin = isStaff(i);
    const choices = db.courses
      .filter((c) => admin || c.createur === i.user.id)
      .filter((c) => !query || String(c.id).includes(query) || norm(courseTitle(c)).includes(query))
      // Les cours à venir d'abord, puis les plus récents
      .sort((a, b) => {
        const fa = courseEnd(a) > now, fb = courseEnd(b) > now;
        if (fa !== fb) return fa ? -1 : 1;
        return fa ? a.start - b.start : b.start - a.start;
      })
      .slice(0, 25)
      .map((c) => {
        const when = DateTime.fromSeconds(c.start, { zone: TZ }).toFormat('dd/MM HH:mm');
        return { name: `[${c.id}] ${courseTitle(c)} — ${when} — ${c.salle}`.slice(0, 100), value: c.id };
      });
    return i.respond(choices);
  }

  return i.respond([]);
}

// ---------- Routing ----------

const handlers = {
  'cours ajouter': coursAjouter,
  'cours modifier': coursModifier,
  'cours supprimer': coursSupprimer,
  'cours liste': coursListe,
  'cours actualiser': coursActualiser,
  'stats createur': statsCreateur,
  'salle ajouter': salleAjouter,
  'salle supprimer': salleSupprimer,
  'salle liste': salleListe,
  'config planning': configPlanning,
  'config historique': configHistorique,
  'config role-prof': configRole,
  'config role-staff': configStaff,
  'config voir': configVoir,
};

client.on('interactionCreate', async (i) => {
  try {
    if (i.isAutocomplete()) return await autocomplete(i);
    if (!i.isChatInputCommand()) return;
    const handler = handlers[`${i.commandName} ${i.options.getSubcommand(false)}`];
    if (handler) await handler(i);
  } catch (err) {
    console.error(err);
    if (i.isRepliable?.()) {
      const msg = { content: '❌ Une erreur est survenue.', ...EPHEMERAL };
      if (i.deferred || i.replied) await i.followUp(msg).catch(() => null);
      else await i.reply(msg).catch(() => null);
    }
  }
});

client.once('clientReady', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await refreshPlanning(client, { force: true }).catch(() => null);
  // Rafraîchit l'emploi du temps chaque minute (cours terminés / « En cours »), n'édite que si ça change
  setInterval(() => refreshPlanning(client).catch(() => null), 60 * 1000);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
