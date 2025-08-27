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


router.post("/webhook/:chatbotId", async (req, res) => {
  try {
    console.log("Mensaje recibido:", JSON.stringify(req.body, null, 2));
    const chatbotId = req.params.chatbotId;
    const message = req.body.message;

    if (!message || !message.chat || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text;

    // Buscar bot por su _id
    const bot = await Chatbot.findById(chatbotId).populate("user");
    if (!bot || !bot._id) {
      console.error("Bot no encontrado o _id inválido:", chatbotId);
      return res.sendStatus(500);
    }
    
    if (!bot.telegramToken) {
      console.error("No hay token de Telegram para este bot");
      return res.sendStatus(200);
    }

    // Guardar el chatId de Telegram asociado al cliente (solo la primera vez)
    if (!bot.telegramChatId) {
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
      const { start } = parseDate(text);
      const startTime = start;
      const endTime = new Date(start.getTime() + (duration + buffer) * 60000);

      // Consultar Google Calendar
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

        // Notificar al dueño por email
        await sendEmail({
          to: owner.email,
          subject: `Nueva cita agendada (${bot.name})`,
          text: `Cita añadida a tu Google Calendar:\n${link}\n\nMensaje cliente:\n"${text}"`,
        });
      }
    }

    // Guardar respuesta del bot
    await Conversation.create({ bot: bot._id, sender: "bot", message: reply });

    // ✅ CORREGIDO: Mejor logging para debug
    console.log("Enviando mensaje a Telegram:", {
      chat_id: chatId,
      text: reply.substring(0, 50) + "...", // Solo mostrar parte del texto
      token: bot.telegramToken ? "PRESENTE" : "FALTANTE"
    });

    // Enviar respuesta a Telegram
    await axios.post(
      `https://api.telegram.org/bot${bot.telegramToken}/sendMessage`,
      { 
        chat_id: chatId, 
        text: reply,
        parse_mode: "HTML" // Opcional: para formato básico
      }
    );

    res.sendStatus(200);
  } catch (e) {
    console.error("Error en webhook Telegram:", e.message);
    res.sendStatus(500);
  }
});

export default router;
