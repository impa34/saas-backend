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
    console.log("=== WEBHOOK RECIBIDO ===");
    console.log("Chatbot ID:", req.params.chatbotId);
    
    const chatbotId = req.params.chatbotId;
    const message = req.body.message;

    if (!message) {
      console.log("No hay mensaje en el body");
      return res.sendStatus(200);
    }

    if (!message.chat || !message.text) {
      console.log("Mensaje sin chat o text:", message);
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text = message.text;
    
    console.log("Chat ID:", chatId, "Texto:", text);

    // Buscar el bot
    const bot = await Chatbot.findById(chatbotId).populate("user");
    if (!bot) {
      console.error("❌ Bot no encontrado con ID:", chatbotId);
      return res.sendStatus(500);
    }
    
    console.log("Bot encontrado:", bot.name);

    // Guardar mensaje del usuario
    await Conversation.create({ bot: bot._id, sender: "user", message: text });

    // Obtener respuesta IA
    let reply = await getGeminiReply(text, bot.prompts, bot.dataset);

    // Buscar servicio en dataset
    let selectedService = null;

    // 1. Buscar servicio mencionado explícitamente en el mensaje
    if (Array.isArray(bot.dataset)) {
      selectedService = bot.dataset.find(row =>
        row.servicio && text.toLowerCase().includes(row.servicio.toLowerCase())
      );
    }

    // 2. Si no se mencionó servicio, usar el primer servicio del dataset
    if (!selectedService && Array.isArray(bot.dataset) && bot.dataset.length > 0) {
      selectedService = bot.dataset[0];
      console.log("Usando servicio por defecto:", selectedService.servicio);
    }

    // 3. También buscar si el servicio se detecta en los prompts
    if (!selectedService && Array.isArray(bot.prompts)) {
      for (const prompt of bot.prompts) {
        if (prompt.question && text.toLowerCase().includes(prompt.question.toLowerCase())) {
          const serviceMatch = prompt.answer.match(/(manicura|pedicura|pestañas|masaje|tratamiento)/i);
          if (serviceMatch && Array.isArray(bot.dataset)) {
            selectedService = bot.dataset.find(row => 
              row.servicio && row.servicio.toLowerCase().includes(serviceMatch[0].toLowerCase())
            );
            if (selectedService) break;
          }
        }
      }
    }

    // Respuestas sobre precio/duración
    if (selectedService) {
      const priceRegex = /precio|cuesta|cost|cuánto|valor/i;
      const durationRegex = /duración|dura|tiempo|cuanto tiempo|horas|minutos/i;

      if (priceRegex.test(text)) {
        reply = `${selectedService.servicio} cuesta ${selectedService.precio} € y dura ${selectedService.duracion} minutos.`;
      } else if (durationRegex.test(text)) {
        reply = `${selectedService.servicio} dura ${selectedService.duracion} minutos y cuesta ${selectedService.precio} €.`;
      }
    }

    // Detectar cita
    const citaPatterns = [
      /cita (confirmada|agendada|programada|reservada)/i,
      /(confirmo|agendo|programo) (la |el )?cita/i,
      /(quiero|deseo) (agendar|programar) (una |la )?cita/i,
      /(sí|ok|confirmado|de acuerdo|perfecto).*(cita|reserva)/i
    ];

    const citaOK = citaPatterns.some(pattern => pattern.test(reply)) || 
                   /cita (confirmada|agendada|programada)/i.test(reply);

    console.log("Detección de cita:", citaOK, "Texto:", reply);
    console.log("Servicio seleccionado:", selectedService);
    console.log("User tiene GoogleTokens:", !!bot.user.googleTokens);

    if (citaOK && bot.user.googleTokens) {
      console.log("✅ Intentando crear evento en calendario...");
      
      const owner = bot.user;
      const duration = selectedService ? parseInt(selectedService.duracion) || 30 : 30;
      const serviceName = selectedService ? selectedService.servicio : "Cita";
      const buffer = 10;

      const { start, end } = parseDate(text);
      
      if (!start) {
        console.error("❌ No se pudo detectar la fecha en el mensaje:", text);
        reply = "No pude detectar la fecha y hora para la cita. Por favor, especifica fecha y hora claramente.";
      } else {
        const startTime = start;
        const endTime = new Date(start.getTime() + (duration + buffer) * 60000);

        // Solo verificar disponibilidad si hay un servicio específico
        if (selectedService) {
          const events = await getCalendarEvents(
            owner.googleTokens,
            startTime,
            endTime,
            serviceName
          );

          if (events && events.length >= (selectedService.capacidad || 1)) {
            reply = `Lo siento, no hay disponibilidad para "${serviceName}" en ese horario. Por favor, sugiere otra hora.`;
            
            // Guardar y enviar respuesta inmediatamente
            await Conversation.create({ bot: bot._id, sender: "bot", message: reply });
            
            // Enviar respuesta a Telegram
            if (bot.telegramToken) {
              await axios.post(
                `https://api.telegram.org/bot${bot.telegramToken}/sendMessage`,
                { chat_id: chatId, text: reply, parse_mode: "HTML" },
                { timeout: 10000 }
              );
            }
            
            return res.sendStatus(200);
          }
        }

        try {
          const link = await addCalendarEvent({
            tokens: owner.googleTokens,
            summary: `Cita: ${serviceName}`,
            description: `Cliente de Telegram\nMensaje: "${text}"\nBot: "${reply}"\nServicio: ${serviceName}`,
            durationMinutes: duration,
            startTime: startTime,
          });

          if (link) {
            await sendEmail({
              to: owner.email,
              subject: `📅 Nueva cita desde Telegram (${bot.name})`,
              text: `Cita añadida a tu Google Calendar:\n${link}\n\nServicio: ${serviceName}\nDuración: ${duration} minutos\nCliente de Telegram\nMensaje: "${text}"`,
            });
            
            console.log("✅ Evento creado y email enviado");
            
            // Actualizar respuesta para incluir confirmación
            reply += `\n\n✅ Cita agendada para el ${startTime.toLocaleDateString()} a las ${startTime.toLocaleTimeString()}.`;
          } else {
            reply = "Hubo un error al crear la cita en el calendario. Por favor, intenta de nuevo.";
          }
        } catch (calendarError) {
          console.error("❌ Error al crear evento:", calendarError);
          reply = "Lo siento, hubo un error al crear la cita. Por favor, contacta con el establecimiento directamente.";
        }
      }
    }

    // Guardar respuesta del bot
    await Conversation.create({ bot: bot._id, sender: "bot", message: reply });

    // Enviar respuesta a Telegram si hay token
    if (bot.telegramToken) {
      try {
        await axios.post(
          `https://api.telegram.org/bot${bot.telegramToken}/sendMessage`,
          { chat_id: chatId, text: reply, parse_mode: "HTML" },
          { timeout: 10000 }
        );
        console.log("✅ Mensaje enviado a Telegram");
      } catch (telegramError) {
        console.error("❌ Error enviando a Telegram:", telegramError.message);
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("Error en webhook Telegram:", e.message);
    res.sendStatus(500);
  }
});

export default router;
