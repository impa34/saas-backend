// services/telegramBots.js
const TelegramBot = require("node-telegram-bot-api");
const Chatbot = require("../models/Chatbot");

const activeBots = new Map(); // Guardamos los bots activos en memoria

async function startTelegramBot(chatbot) {
  if (!chatbot.telegramToken) return;

  // Si ya está corriendo, no lo reiniciamos
  if (activeBots.has(chatbot._id.toString())) return;

  const bot = new TelegramBot(chatbot.telegramToken, { polling: true });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    // Aquí conectas con la lógica de tu chatbot
    bot.sendMessage(chatId, `🤖 Hola, soy tu bot: ${chatbot.name}`);
  });

  activeBots.set(chatbot._id.toString(), bot);
}

module.exports = { startTelegramBot };
