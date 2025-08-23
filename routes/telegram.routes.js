import express from "express";
import axios from "axios";
import Chatbot from "../models/Chatbot.js";
import { getGeminiReply } from "../utils/gemini.js";
import Conversation from "../models/Conversation.js";
import { parseDate } from "../utils/parseDate.js";
import { getCalendarEvents } from "../utils/getCalendarEvents.js";
import { addCalendarEvent } from "../utils/calendar.js";
import { sendEmail } from "../utils/sendEmail.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.chat || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text;

    // Buscar bot asociado
let bot = await Chatbot.findOne({ telegramChatId: chatId });
if (!bot) {
    // Toma un bot por defecto del usuario que quieres probar
    bot = await Chatbot.findOne({ user: userId }).populate("user prompts");

    // Asocia este chat de Telegram con el bot
    bot.telegramChatId = chatId;
    await bot.save();
}


    // Guardar mensaje del usuario
    await Conversation.create({ bot: bot._id, sender: "user", message: text });

    // Obtener respuesta IA
    let reply = await getGeminiReply(text, bot.prompts, bot.dataset);

    // Revisar dataset de servicios
    let selectedService = null;
    if (Array.isArray(bot.dataset)) {
      selectedService = bot.dataset.find(row =>
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

    // Detectar cita
    const citaOK = /cita (confirmada|agendada|programada)/i.test(reply);
    if (citaOK && selectedService && bot.user.googleTokens) {
      const owner = bot.user;
      const duration = parseInt(selectedService.duracion) || 30;
      const buffer = 10; // minutos de buffer entre citas

      // Detectar fecha/hora de la cita
      const { start, end } = parseDate(text);
      const startTime = start;
      const endTime = new Date(start.getTime() + (duration + buffer) * 60000);

      // Consultar Google Calendar para evitar solapamientos considerando capacidad
      const events = await getCalendarEvents(
        owner.googleTokens,
        startTime,
        endTime,
        selectedService.servicio
      );

      if (events && events.length >= (selectedService.capacidad || 1)) {
        reply = `Lo siento, no hay disponibilidad para "${selectedService.servicio}" en ese horario. Por favor, sugiere otra hora.`;
      } else {
        // Crear evento
        const link = await addCalendarEvent({
          tokens: owner.googleTokens,
          summary: `Cita: ${selectedService.servicio}`,
          description: `Mensaje: "${text}"\nBot: "${reply}"`,
          durationMinutes: duration,
          startTime,
        });

        // Enviar email al propietario
        await sendEmail({
          to: owner.email,
          subject: `Nueva cita agendada (${bot.name})`,
          text: `Cita añadida a tu Google Calendar:\n${link}\n\nMensaje cliente:\n"${text}"`,
        });
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
  } catch (e) {
    console.error("Error en webhook Telegram:", e);
    res.sendStatus(500);
  }
});

export default router;
