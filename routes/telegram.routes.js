// routes/telegram.js
import express from "express";
import axios from "axios";
import Chatbot from "../models/Chatbot.js";
import { getGeminiReply } from "../utils/gemini.js";
import Conversation from "../models/Conversation.js";

const router = express.Router();

// Para guardar bots/usuarios conectados en DB
// Aquí luego lo puedes relacionar con tu modelo de Chatbot
router.post("/webhook", async (req, res) => {
  const message = req.body.message;
  if (!message || !message.chat || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text;

  // Buscar bot asociado
  const bot = await Chatbot.findOne({ telegramChatId: chatId }).populate("user prompts");
  if (!bot) return res.sendStatus(200);

  // Guardar mensaje del usuario
  await Conversation.create({ bot: bot._id, sender: "user", message: text });

  // Obtener respuesta IA
  let reply = await getGeminiReply(text, bot.prompts, bot.dataset);

  // Revisar dataset de servicios
  if (Array.isArray(bot.dataset)) {
    const selectedService = bot.dataset.find(row =>
      row.servicio && text.toLowerCase().includes(row.servicio.toLowerCase())
    );

    if (selectedService) {
      const priceRegex = /precio|cuesta|cost/i;
      const durationRegex = /duración|dura|tiempo/i;

      if (priceRegex.test(text)) {
        reply = `${selectedService.servicio} cuesta ${selectedService.precio} € y dura ${selectedService.duracion} minutos.`;
      } else if (durationRegex.test(text)) {
        reply = `${selectedService.servicio} dura ${selectedService.duracion} minutos y cuesta ${selectedService.precio} €.`;
      }
    }
  }

  // Guardar respuesta del bot
  await Conversation.create({ bot: bot._id, sender: "bot", message: reply });

  // Enviar respuesta a Telegram
  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    { chat_id: chatId, text: reply }
  );

  res.sendStatus(200);
});


export default router;
