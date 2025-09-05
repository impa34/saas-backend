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
import checkPlan from "../middleware/checkPlan.js";

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
router.post("/:id/integrations/telegram", auth, checkPlan(), async (req, res) => {
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

    let reply = "";

    // --------------------------
    // 1. Detectar intención de cita en el MENSAJE
    // --------------------------
    const citaIntentRegex = /(cita|reservar|agendar|programar|quiero|deseo)/i;
    const userWantsAppointment = citaIntentRegex.test(message);
    console.log("¿Usuario quiere cita?:", userWantsAppointment);

    // --------------------------
    // 2. Intentar identificar servicio
    // --------------------------
    let selectedService = null;
    if (Array.isArray(bot.dataset)) {
      selectedService = bot.dataset.find(row =>
        row.servicio && message.toLowerCase().includes(row.servicio.toLowerCase())
      );
    }

    // Palabras clave si no se encontró directo
    if (!selectedService && Array.isArray(bot.dataset)) {
      const serviceKeywords = {
        corte: ["corte", "pelo", "cabello", "cortar"],
        manicura: ["manicura", "uñas", "esmaltado"],
        pedicura: ["pedicura", "pies", "uñas pies"],
        pestañas: ["pestañas", "extensiones", "lifting"],
        masaje: ["masaje", "relajante", "terapéutico"],
      };
      for (const [serviceType, keywords] of Object.entries(serviceKeywords)) {
        if (keywords.some(k => message.toLowerCase().includes(k))) {
          selectedService = bot.dataset.find(row =>
            row.servicio && row.servicio.toLowerCase().includes(serviceType)
          );
          break;
        }
      }
    }

    // Si no hay, usar default
    if (!selectedService && Array.isArray(bot.dataset) && bot.dataset.length > 0) {
      selectedService = bot.dataset[0];
    }

    console.log("Servicio detectado:", selectedService?.servicio);

    // --------------------------
    // 3. Si es sobre precio/duración → responder directo
    // --------------------------
    if (selectedService) {
      const priceRegex = /precio|cuesta|cost|cuánto|valor/i;
      const durationRegex = /duración|dura|tiempo|horas|minutos/i;

      if (priceRegex.test(message)) {
        reply = `${selectedService.servicio} cuesta ${selectedService.precio} € y dura ${selectedService.duracion} minutos.`;
      } else if (durationRegex.test(message)) {
        reply = `${selectedService.servicio} dura ${selectedService.duracion} minutos y cuesta ${selectedService.precio} €.`;
      }
    }

    // --------------------------
    // 4. Si el usuario quiere cita → parsear fecha y crear evento
    // --------------------------
    if (userWantsAppointment && bot.user?.googleTokens) {
      const duration = selectedService ? parseInt(selectedService.duracion) || 30 : 30;
      const serviceName = selectedService ? selectedService.servicio : "Cita de cliente";

      console.log("Parseando fecha del mensaje:", message);
      const { start } = parseDate(message);
      if (!start) {
        reply = "No pude detectar la fecha y hora para la cita. Por favor, especifica fecha y hora claramente (ej: 'mañana a las 10:00').";
      } else {
        const startTime = start;
        const endTime = new Date(start.getTime() + duration * 60000);

        try {
          const events = await getCalendarEvents(bot.user.googleTokens, startTime, endTime, serviceName);
          if (events && events.length >= (selectedService?.capacidad || 1)) {
            reply = `Lo siento, no hay disponibilidad para "${serviceName}" en ese horario. ¿Quieres otra hora?`;
          } else {
const link = await addCalendarEvent({
  tokens: bot.user.googleTokens, // ❌ Error: User.googleTokens → ✅ Corrección: bot.user.googleTokens
  summary: `Cita: ${serviceName}`,
  description: `Cliente: Web\nServicio: ${serviceName}\nDuración: ${duration} min\nMensaje: "${message}"\nRespuesta bot: "${reply}"`,
  durationMinutes: duration,
  startTime: startTime,
  timeZone: bot.user.timeZone || "Europe/Madrid", // También corregir aquí
});

            if (link) {
              // Email
              await sendEmail({
                to: bot.user.email,
                subject: `📅 Nueva cita - ${serviceName}`,
                text: `Nueva cita:\n📅 ${startTime.toLocaleDateString()} ${startTime.toLocaleTimeString()}\n💼 ${serviceName}\n\n${link}`,
              });

              reply = `✅ Tu cita de ${serviceName} queda confirmada para el ${startTime.toLocaleDateString()} a las ${startTime.toLocaleTimeString()}. Se ha enviado confirmación por email.`;
            } else {
              reply = "❌ Hubo un error al crear la cita. Intenta de nuevo.";
            }
          }
        } catch (err) {
          console.error("❌ Error calendario:", err);
          reply = "Hubo un problema al crear la cita. Por favor, intenta más tarde.";
        }
      }
    }

    // --------------------------
    // 5. Si no es cita ni precio/duración → usar Gemini normal
    // --------------------------
    if (!reply) {
      reply = await getGeminiReply(message, bot.prompts, bot.dataset);
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
      totalMessages++

      
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
