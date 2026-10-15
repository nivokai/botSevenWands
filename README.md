# 7Wands - Calendrier

Bot Discord de planning de cours :
- un salon **emploi du temps** : un message mis à jour automatiquement avec les cours en cours et à venir sur les 7 prochains jours ;
- un salon **historique** : un message par jour (`📜 Vendredi 9 Octobre`) avec tous les cours de ce jour, mis à jour à chaque ajout, modification ou suppression.

## Installation

1. Sur https://discord.com/developers/applications, crée une application, puis dans **Bot** clique sur *Reset Token* et copie le token.
2. Invite le bot : **OAuth2 > URL Generator**, coche `bot` + `applications.commands`, et donne-lui les permissions *Voir les salons*, *Envoyer des messages*, *Intégrer des liens* et *Lire l'historique des messages*.
3. Ouvre `.env` et remplis `DISCORD_TOKEN`, `CLIENT_ID` et `GUILD_ID`.
   Pour continuer la numérotation actuelle, mets `START_ID=28305` **avant le premier lancement**.
4. Lance ces commandes :

```bash
npm install
```

```bash
npm run deploy
```

```bash
npm start
```

`npm run deploy` ne sert qu'à enregistrer les commandes slash : relance-le uniquement si les commandes changent.

## Premiers réglages sur Discord

1. `/config planning salon:#emploi-du-temps`
2. `/config historique salon:#historique`
3. `/salle ajouter nom:Serres` (une fois par salle)
4. Optionnel : `/config role-prof role:@Professeur` pour que seul ce rôle (et les admins) puisse créer des cours.
5. Optionnel : `/config role-staff role:@Direction` pour que ce rôle puisse modifier et supprimer **tous** les cours. Sans ça, chacun ne gère que ses propres cours (sauf les admins).

## Commandes

| Commande | Rôle |
|---|---|
| `/cours ajouter matiere intitule salle datetime duree annee` | Ajouter un cours (ex : SORTS + `Flamette` → **Sort (Flamette)**) |
| `/cours modifier id …` | Modifier un cours (le créateur, le rôle staff ou un admin) |
| `/cours supprimer id` | Supprimer un cours (le créateur, le rôle staff ou un admin) |
| `/cours liste [passes] [createur]` | Afficher tous les cours |
| `/cours actualiser` | Actualiser manuellement tous les embeds |
| `/stats createur [utilisateur]` | Voir les détails d'un créateur |
| `/salle ajouter / supprimer / liste` | Gérer les salles (admins pour ajouter/supprimer) |
| `/config planning / historique / role-prof / role-staff / voir` | Configuration (permission « Gérer le serveur ») |

**Format de `datetime`** (heure de Paris) : `09/10/2026 14:20`, `9/10 14h20`, `demain 20h`, `14:20` (aujourd'hui).
Pendant la saisie, Discord affiche un aperçu de la date comprise par le bot.

Les données sont stockées dans `data/db.json`.
