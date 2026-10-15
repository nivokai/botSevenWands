require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('DISCORD_TOKEN, CLIENT_ID et GUILD_ID doivent être définis dans .env');
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);
rest
  .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  .then((data) => console.log(`${data.length} commandes enregistrées sur le serveur ${GUILD_ID}.`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
