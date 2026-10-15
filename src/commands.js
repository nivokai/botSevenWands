const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { MATIERES, ANNEES, anneeLabel } = require('./format');

const matiereChoices = Object.entries(MATIERES).map(([value, m]) => ({ name: m.name, value }));
const anneeChoices = ANNEES.map((n) => ({ name: anneeLabel(n), value: n }));

const DATETIME_DESC = 'Date et heure (Paris) — ex: 09/10/2026 14:20, 9/10 14h20, demain 20h';
const INTITULE_DESC = 'Nom du cours — ex: Flamette, Nivara Vervenin, Nanis de Jouvencine - Pratique';

const cours = new SlashCommandBuilder()
  .setName('cours')
  .setDescription('Planning de cours')
  .addSubcommand((s) => s.setName('actualiser').setDescription('Actualiser manuellement tous les embeds'))
  .addSubcommand((s) =>
    s
      .setName('ajouter')
      .setDescription('Ajouter un nouveau cours')
      .addStringOption((o) => o.setName('matiere').setDescription('Matière').setRequired(true).addChoices(...matiereChoices))
      .addStringOption((o) => o.setName('intitule').setDescription(INTITULE_DESC).setRequired(true).setMaxLength(100).setAutocomplete(true))
      .addStringOption((o) => o.setName('salle').setDescription('Salle').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('datetime').setDescription(DATETIME_DESC).setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(600))
      .addIntegerOption((o) => o.setName('annee').setDescription('Année').setRequired(true).addChoices(...anneeChoices)),
  )
  .addSubcommand((s) =>
    s
      .setName('liste')
      .setDescription('Afficher tous les cours')
      .addBooleanOption((o) => o.setName('passes').setDescription('Afficher aussi les cours passés (30 derniers jours)'))
      .addUserOption((o) => o.setName('createur').setDescription('Filtrer par créateur')),
  )
  .addSubcommand((s) =>
    s
      .setName('modifier')
      .setDescription('Modifier un cours existant')
      .addIntegerOption((o) => o.setName('id').setDescription('Numéro du cours').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('matiere').setDescription('Matière').addChoices(...matiereChoices))
      .addStringOption((o) => o.setName('intitule').setDescription(INTITULE_DESC).setMaxLength(100).setAutocomplete(true))
      .addStringOption((o) => o.setName('salle').setDescription('Salle').setAutocomplete(true))
      .addStringOption((o) => o.setName('datetime').setDescription(DATETIME_DESC).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('duree').setDescription('Durée en minutes').setMinValue(1).setMaxValue(600))
      .addIntegerOption((o) => o.setName('annee').setDescription('Année').addChoices(...anneeChoices)),
  )
  .addSubcommand((s) =>
    s
      .setName('supprimer')
      .setDescription('Supprimer un cours')
      .addIntegerOption((o) => o.setName('id').setDescription('Numéro du cours').setRequired(true).setAutocomplete(true)),
  );

const stats = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Statistiques')
  .addSubcommand((s) =>
    s
      .setName('createur')
      .setDescription("Voir les détails d'un créateur")
      .addUserOption((o) => o.setName('utilisateur').setDescription('Créateur (vous par défaut)')),
  );

const salle = new SlashCommandBuilder()
  .setName('salle')
  .setDescription('Gérer les salles')
  .addSubcommand((s) =>
    s
      .setName('ajouter')
      .setDescription('Ajouter une salle')
      .addStringOption((o) => o.setName('nom').setDescription('Nom de la salle').setRequired(true).setMaxLength(80)),
  )
  .addSubcommand((s) =>
    s
      .setName('supprimer')
      .setDescription('Supprimer une salle')
      .addStringOption((o) => o.setName('nom').setDescription('Nom de la salle').setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) => s.setName('liste').setDescription('Afficher toutes les salles'));

const config = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configuration du bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('planning')
      .setDescription("Salon où afficher l'emploi du temps (7 prochains jours)")
      .addChannelOption((o) =>
        o.setName('salon').setDescription('Salon').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('historique')
      .setDescription("Salon où publier l'historique complet des cours")
      .addChannelOption((o) =>
        o.setName('salon').setDescription('Salon').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('role-prof')
      .setDescription('Rôle autorisé à créer des cours (vide = tout le monde)')
      .addRoleOption((o) => o.setName('role').setDescription('Rôle (laisser vide pour retirer la restriction)')),
  )
  .addSubcommand((s) =>
    s
      .setName('role-staff')
      .setDescription('Rôle autorisé à modifier/supprimer tous les cours (vide = admins seulement)')
      .addRoleOption((o) => o.setName('role').setDescription('Rôle (laisser vide pour retirer)')),
  )
  .addSubcommand((s) => s.setName('voir').setDescription('Voir la configuration actuelle'));

module.exports = [cours, stats, salle, config].map((c) => c.toJSON());
