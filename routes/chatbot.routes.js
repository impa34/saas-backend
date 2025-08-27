import express from "express";
const router = express.Router();
import Chatbot from "../models/Chatbot.js";
import axios from "axios"
import auth from "../middleware/auth.js";
import { getGeminiReply } from "../utils/gemini.js";
import { addCalendarEvent } from "../utils/calendar.js";
import multer from "multer";
import xlsx from "xlsx";
import fs from "fs";
import csv from "csv-parser";
import { sendEmail } from "../utils/sendEmail.js";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { Parser } from "json2csv";
import { getCalendarEvents } from "../utils/getCalendarEvents.js";
import { parseDate } from "../utils/parseDate.js";

const upload = multer({ dest: "uploads/" });

router.post("/:id/upload", auth, upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) return res.status(404).json({ message: "File not found" });

  let data = [];

  try {
    if (file.mimetype === "text/csv") {
      const rows = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(file.path)
          .pipe(csv())
          .on("data", (row) => results.push(row))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
      fs.unlinkSync(file.path);
      data = rows;
    } else {
      const workbook = xlsx.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(sheet);
    }
    const bot = await Chatbot.findByIdAndUpdate(
      req.params.id,
      { dataset: data },
      { new: true }
    );
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    res.json({ message: "Excel processed", data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error uploading file" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const chatbot = await Chatbot.findById(req.params.id);
    if (!chatbot) return res.status(404).json({ message: "Chatbot not found" });

    res.json(chatbot);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const chatBots = await Chatbot.find({ user: req.user.userId }).populate(
      "prompts"
    );
    res.json(chatBots);
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch chatbots" });
  }
});

router.post("/", auth, async (req, res) => {
  const { name, prompts } = req.body;
  const chatbot = await Chatbot.create({
    user: req.user.userId,
    name,
    prompts,
  });

  res.status(201).json(chatbot);
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Chatbot.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Bot not found" });
    }
    res.json({ message: "Bot deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error deleting bot" });
  }
});

// Guardar el token de Telegram
router.post("/:id/integrations/telegram", auth, async (req, res) => {
  try {
    const { token } = req.body;
    const chatbotId = req.params.id;

    if (!token) {
      return res.status(400).json({ error: "El token de Telegram es obligatorio" });
    }

    // Validar el token con Telegram
    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    if (!response.data.ok) {
      return res.status(400).json({ error: "Token de Telegram inválido" });
    }

    // ✅ CORRECCIÓN: Cambiar 'chatbot' por 'bot' para ser consistente
    console.log("Chatbot ID recibido:", chatbotId);
    console.log("Tipo de ID:", typeof chatbotId);

    // Verifica que el formato sea correcto
    const bot = await Chatbot.findById(chatbotId).populate("user");
    if (!bot) {
      console.error("❌ NO SE ENCUENTRA EL BOT - Verifica el ID:");
      console.error("ID buscado:", chatbotId);
      console.error("Es ObjectId válido?", mongoose.Types.ObjectId.isValid(chatbotId));
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    // ✅ CORRECCIÓN: Usar 'bot' en lugar de 'chatbot'
    bot.telegramToken = token;
    bot.telegramBotUsername = response.data.result.username;
    await bot.save();

    // Webhook URL con chatbotId
    const webhookUrl = `https://saas-backend-xrkb.onrender.com/api/telegram/webhook/${chatbotId}`;
    const webhookRes = await axios.get(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);

    if (!webhookRes.data.ok) {
      return res.status(500).json({ error: "No se pudo registrar el webhook en Telegram" });
    }

    res.json({
      success: true,
      message: "Token de Telegram guardado y webhook registrado correctamente",
      bot: response.data.result,
      webhook: webhookRes.data.result
    });

  } catch (err) {
    console.error("Error al guardar token de Telegram:", err.message);
    res.status(500).json({ error: "Error al guardar la integración con Telegram" });
  }
});



router.put("/:id", auth, async (req, res) => {
  try {
    const bot = await Chatbot.findById(req.params.id);
    if (!bot) {
      return res.status(404).json({ message: "Bot not found" });
    }
  
    if (bot.user.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const updated = await Chatbot.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Bot not found" });

    res.json(updated);
    
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Error editing chatbot" });
  }
});

router.post("/:id/reply", async (req, res) => {
  try {
    console.log("=== WEB ENDPOINT RECIBIDO ===");
    const { message } = req.body;
    console.log("Mensaje recibido:", message);
    
    const bot = await Chatbot.findById(req.params.id).populate("user");
    if (!bot) {
      console.error("❌ Bot no encontrado");
      return res.status(404).json({ message: "Bot not found" });
    }

    console.log("Bot encontrado:", bot.name);
    console.log("User del bot:", bot.user?.email);

    // Guardar mensaje del usuario
    await Conversation.create({
      bot: bot._id,
      sender: "user",
      message,
    });

    // Obtener respuesta IA
    let reply = await getGeminiReply(message, bot.prompts, bot.dataset);
    console.log("Respuesta Gemini:", reply);

    // Buscar servicio en dataset
    let selectedService = null;

    // 1. Buscar servicio mencionado explícitamente en el mensaje
    if (Array.isArray(bot.dataset)) {
      selectedService = bot.dataset.find(row =>
        row.servicio && message.toLowerCase().includes(row.servicio.toLowerCase())
      );
      console.log("Servicio encontrado por nombre:", selectedService?.servicio);
    }

    // 2. Si no encuentra servicio, buscar por palabras clave
    if (!selectedService && Array.isArray(bot.dataset)) {
      const serviceKeywords = {
        'corte': ['corte', 'pelo', 'cabello', 'cortar'],
        'manicura': ['manicura', 'uñas', 'esmaltado'],
        'pedicura': ['pedicura', 'pies', 'uñas pies'],
        'pestañas': ['pestañas', 'extensiones', 'lifting'],
        'masaje': ['masaje', 'relajante', 'terapéutico']
      };

      for (const [serviceType, keywords] of Object.entries(serviceKeywords)) {
        if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
          selectedService = bot.dataset.find(row => 
            row.servicio && row.servicio.toLowerCase().includes(serviceType)
          );
          if (selectedService) {
            console.log("Servicio encontrado por palabra clave:", selectedService.servicio);
            break;
          }
        }
      }
    }

    // 3. Si no se mencionó servicio, usar el primer servicio del dataset
    if (!selectedService && Array.isArray(bot.dataset) && bot.dataset.length > 0) {
      selectedService = bot.dataset[0];
      console.log("Usando servicio por defecto:", selectedService?.servicio);
    }

    // Respuestas sobre precio/duración
    if (selectedService) {
      const priceRegex = /precio|cuesta|cost|cuánto|valor/i;
      const durationRegex = /duración|dura|tiempo|cuanto tiempo|horas|minutos/i;

      if (priceRegex.test(message)) {
        reply = `${selectedService.servicio} cuesta ${selectedService.precio} € y dura ${selectedService.duracion} minutos.`;
      } else if (durationRegex.test(message)) {
        reply = `${selectedService.servicio} dura ${selectedService.duracion} minutos y cuesta ${selectedService.precio} €.`;
      }
    }

    // DETECCIÓN DE CITA MEJORADA
    const citaPatterns = [
      /cita (confirmada|agendada|programada|reservada)/i,
      /(confirmo|agendo|programo) (la |el )?cita/i,
      /(quiero|deseo) (agendar|programar) (una |la )?cita/i,
      /(sí|ok|confirmado|de acuerdo|perfecto).*(cita|reserva)/i,
      /claro.*cita|confirmada.*cita/i
    ];

    const citaOK = citaPatterns.some(pattern => {
      const match = pattern.test(reply);
      if (match) console.log("Patrón que coincide:", pattern.toString());
      return match;
    });

    console.log("Detección de cita WEB:", citaOK);
    console.log("Servicio seleccionado WEB:", selectedService?.servicio);
    console.log("User tiene GoogleTokens WEB:", !!bot.user?.googleTokens);
    console.log("GoogleTokens presentes:", bot.user?.googleTokens ? "SÍ" : "NO");

    // LÓGICA DE CITA
    if (citaOK && bot.user?.googleTokens) {
      console.log("✅ Intentando crear evento en calendario desde WEB...");
      
      const owner = bot.user;
      const duration = selectedService ? parseInt(selectedService.duracion) || 30 : 30;
      const serviceName = selectedService ? selectedService.servicio : "Cita de cliente";
      const buffer = 10;

      console.log("Parseando fecha del mensaje:", message);
      const { start, end } = parseDate(message);
      console.log("Fecha parseada - start:", start, "end:", end);
      
      if (!start) {
        console.error("❌ No se pudo detectar la fecha en WEB");
        reply = "No pude detectar la fecha y hora para la cita. Por favor, especifica fecha y hora claramente (ej: 'hoy a las 17:00' o 'mañana a las 10:30').";
      } else {
        const startTime = start;
        const endTime = new Date(start.getTime() + (duration + buffer) * 60000);

        console.log("Fecha de inicio:", startTime);
        console.log("Fecha de fin:", endTime);

        try {
          // Verificar disponibilidad
          if (selectedService) {
            console.log("Verificando disponibilidad para:", serviceName);
            const events = await getCalendarEvents(
              owner.googleTokens,
              startTime,
              endTime,
              serviceName
            );

            console.log("Eventos encontrados en ese horario:", events?.length);
            if (events && events.length >= (selectedService.capacidad || 1)) {
              console.log("❌ No hay disponibilidad");
              return res.json({
                reply: `Lo siento, no hay disponibilidad para "${serviceName}" en ese horario. Por favor, sugiere otra hora.`
              });
            }
          }

          // Crear evento
          console.log("Creando evento en calendario...");
          const link = await addCalendarEvent({
            tokens: owner.googleTokens,
            summary: `Cita: ${serviceName}`,
            description: `Cliente: Web\nServicio: ${serviceName}\nDuración: ${duration} min\nMensaje: "${message}"\nRespuesta bot: "${reply}"`,
            durationMinutes: duration,
            startTime: startTime
          });

          console.log("Link del evento creado:", link);

          if (link) {
            // Enviar email de confirmación
            console.log("Enviando email a:", owner.email);
            try {
              await sendEmail({
                to: owner.email,
                subject: `📅 Nueva cita desde Web - ${serviceName}`,
                text: `Nueva cita agendada:\n\n📅 Fecha: ${startTime.toLocaleDateString()}\n⏰ Hora: ${startTime.toLocaleTimeString()}\n💼 Servicio: ${serviceName}\n⏱️ Duración: ${duration} minutos\n\nEnlace al calendario: ${link}\n\nMensaje del cliente:\n"${message}"`
              });
              console.log("✅ Email enviado exitosamente");
            } catch (emailError) {
              console.error("❌ Error enviando email:", emailError);
            }

            console.log("✅ Evento creado y email enviado desde WEB");
            reply += `\n\n✅ Cita confirmada para el ${startTime.toLocaleDateString()} a las ${startTime.toLocaleTimeString()}. Se ha enviado la confirmación por email.`;
          } else {
            console.error("❌ Link del evento es null/undefined");
            reply = "Hubo un error al crear la cita en el calendario. Por favor, intenta de nuevo.";
          }
        } catch (calendarError) {
          console.error("❌ Error al crear evento desde WEB:", calendarError);
          console.error("Stack trace:", calendarError.stack);
          reply = "Lo siento, hubo un error al crear la cita. Por favor, contacta con el establecimiento directamente.";
        }
      }
    } else {
      console.log("❌ Condiciones no cumplidas para crear cita:");
      console.log("citaOK:", citaOK);
      console.log("googleTokens:", !!bot.user?.googleTokens);
    }

    // Guardar respuesta del bot
    await Conversation.create({
      bot: bot._id,
      sender: "bot",
      message: reply,
    });

    console.log("Respuesta final:", reply);
    return res.json({ reply });
  } catch (e) {
    console.error("Error in /reply:", e);
    console.error("Stack trace:", e.stack);
    return res.status(500).json({ message: "Couldn't generate message" });
  }
});

router.put("/:id/config", auth, async (req, res) => {
  const { backgroundColor, textColor, font, fontSize } = req.body;
  const bot = await Chatbot.findById(req.params.id);

  if (!bot) return res.status(404).json({ message: "Bot not found" });
  if (bot.user.toString() !== req.user.userId)
    return res.status(403).json({ message: "Forbidden" });

  bot.config = { backgroundColor, textColor, font, fontSize };
  await bot.save();

  res.json({ message: "Config saved" });
});

router.get("/:id/stats",auth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user.userId); // del token

    if (user.status !== "pro" && user.status !== "full") {
      return res.status(403).json({ message: "Pro feature only" });
    }

    const conversations = await Conversation.find({ bot: id });
    if (!conversations.length) {
      return res.json({
        totalConversations: 0,
        totalMessages: 0,
        botMessages: 0,
        userMessages: 0,
        averageMessages: 0,
        lastInteraction: null,
      });
    }
    let totalMessages = 0;
    let botMessages = 0;
    let userMessages = 0;
    let lastInteraction = null;

    for (const convo of conversations) {
      totalMessages += convo.message.length;

      
        if (convo.sender === "bot") botMessages++;
        if (convo.sender === "user") userMessages++;

        if (!lastInteraction || convo.timestamp > lastInteraction) {
          lastInteraction = convo.timestamp;
        }
      ;
    }

    const averageMessages = totalMessages / conversations.length;

    return res.json({
      totalConversations: conversations.length,
      totalMessages,
      botMessages,
      userMessages,
      averageMessages,
      lastInteraction,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
