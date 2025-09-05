import express from "express";
import axios from "axios";
import Chatbot from "../models/Chatbot.js";
import { getGeminiReply } from "../utils/gemini.js";
import Conversation from "../models/Conversation.js";
import { parseDate } from "../utils/parseDate.js";
import { getCalendarEvents } from "../utils/getCalendarEvents.js";
import { addCalendarEvent } from "../utils/calendar.js";
import { sendEmail } from "../utils/sendEmail.js";
import checkPlan from "../middleware/checkPlan.js";
import auth from "../middleware/auth.js"

const router = express.Router();


router.post("/webhook/:chatbotId", async (req, res) => {
  try {
    console.log("=== WEBHOOK RECIBIDO ===");
    console.log("Chatbot ID:", req.params.chatbotId);

     const allowedPlans = ["full", "lifetime"];
    if (!bot.user || !allowedPlans.includes(bot.user.status)) {
      console.error("❌ Plan insuficiente para el usuario:", bot.user?.status);
      return res.sendStatus(403);
    }
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

    // Guardar el chatId de Telegram
    if (!bot.telegramChatId) {
      bot.telegramChatId = chatId;
      await bot.save();
    }

    // Guardar mensaje del usuario - CON VALIDACIÓN DE BOT ID
    if (bot._id) {
      await Conversation.create({ 
        bot: bot._id, 
        sender: "user", 
        message: text 
      });
    }

    // Obtener respuesta IA
    let reply = await getGeminiReply(text, bot.prompts, bot.dataset);

    // Buscar servicio en dataset
    let selectedService = null;

    if (Array.isArray(bot.dataset)) {
      selectedService = bot.dataset.find(row =>
        row.servicio && text.toLowerCase().includes(row.servicio.toLowerCase())
      );
    }

    // Si no encuentra servicio, buscar por palabras clave
    if (!selectedService && Array.isArray(bot.dataset)) {
      const serviceKeywords = {
        'corte': ['corte', 'pelo', 'cabello', 'cortar'],
        'manicura': ['manicura', 'uñas', 'esmaltado'],
        'pedicura': ['pedicura', 'pies', 'uñas pies'],
        'pestañas': ['pestañas', 'extensiones', 'lifting'],
        'masaje': ['masaje', 'relajante', 'terapéutico']
      };

      for (const [serviceType, keywords] of Object.entries(serviceKeywords)) {
        if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
          selectedService = bot.dataset.find(row => 
            row.servicio && row.servicio.toLowerCase().includes(serviceType)
          );
          if (selectedService) break;
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
      /(sí|ok|confirmado|de acuerdo|perfecto).*(cita|reserva)/i,
      /claro.*cita|confirmada.*cita/i
    ];

    const citaOK = citaPatterns.some(pattern => pattern.test(reply));

    console.log("Detección de cita:", citaOK);
    console.log("Servicio seleccionado:", selectedService);
    console.log("User tiene GoogleTokens:", !!bot.user?.googleTokens);

    if (citaOK && bot.user?.googleTokens) {
      console.log("✅ Intentando crear evento en calendario...");
      
      const owner = bot.user;
      const duration = selectedService ? parseInt(selectedService.duracion) || 30 : 30;
      const serviceName = selectedService ? selectedService.servicio : "Cita de cliente";
      const buffer = 10;

      const { start, end } = parseDate(text);
      
      if (!start) {
        console.error("❌ No se pudo detectar la fecha");
        reply = "No pude detectar la fecha y hora para la cita. Por favor, especifica fecha y hora claramente (ej: 'hoy a las 17:00' o 'mañana a las 10:30').";
      } else {
        const startTime = start;
        const endTime = new Date(start.getTime() + (duration + buffer) * 60000);

        try {
          // Verificar disponibilidad
          const events = await getCalendarEvents(
            owner.googleTokens,
            startTime,
            endTime,
            serviceName
          );

          if (events && events.length > 0) {
            reply = `Lo siento, no hay disponibilidad para el ${start.toLocaleDateString()} a las ${start.toLocaleTimeString()}. Por favor, sugiere otra hora.`;
          } else {
            // Crear evento
            const link = await addCalendarEvent({
              tokens: owner.googleTokens,
              summary: `Cita: ${serviceName}`,
              description: `Cliente: Telegram\nServicio: ${serviceName}\nDuración: ${duration} min\nMensaje: "${text}"\nRespuesta bot: "${reply}"`,
              durationMinutes: duration,
              startTime: startTime
            });

            if (link) {
              // Enviar email de confirmación
              await sendEmail({
                to: owner.email,
                subject: `📅 Nueva cita desde Telegram - ${serviceName}`,
                text: `Nueva cita agendada:\n\n📅 Fecha: ${startTime.toLocaleDateString()}\n⏰ Hora: ${startTime.toLocaleTimeString()}\n💼 Servicio: ${serviceName}\n⏱️ Duración: ${duration} minutos\n\nEnlace al calendario: ${link}\n\nMensaje del cliente:\n"${text}"`
              });

              console.log("✅ Evento creado y email enviado");
              reply += `\n\n✅ Cita confirmada para el ${startTime.toLocaleDateString()} a las ${startTime.toLocaleTimeString()}. Se ha enviado la confirmación por email.`;
            } else {
              reply = "Hubo un error al crear la cita en el calendario. Por favor, intenta de nuevo.";
            }
          }
        } catch (calendarError) {
          console.error("❌ Error al crear evento:", calendarError);
          reply = "Lo siento, hubo un error al crear la cita. Por favor, contacta con el establecimiento directamente.";
        }
      }
    }

    // Guardar respuesta del bot
    if (bot._id) {
      await Conversation.create({ 
        bot: bot._id, 
        sender: "bot", 
        message: reply 
      });
    }

    // Enviar respuesta a Telegram si hay token
    if (bot.telegramToken) {
      try {
        await axios.post(
          `https://api.telegram.org/bot${bot.telegramToken}/sendMessage`,
          { 
            chat_id: chatId, 
            text: reply,
            parse_mode: "HTML" 
          },
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
