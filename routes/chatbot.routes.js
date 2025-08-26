import express from "express";
const router = express.Router();
import Chatbot from "../models/Chatbot.js";
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
router.post("/:id", async (req, res) => {
  const bot = await Chatbot.findById(req.params.id);
  if (!bot) return res.status(404).json({ message: "Bot not found" });
  res.json(bot);
});

// Guardar el token de Telegram
router.post("/:id/integrations/telegram", auth, async (req, res) => {
  try {
    const { token } = req.body;
    const chatbotId = req.params.id;

    if (!token) {
      return res.status(400).json({ error: "El token de Telegram es obligatorio" });
    }

    // Validar el token con Telegram antes de guardarlo
    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);

    if (!response.data.ok) {
      return res.status(400).json({ error: "Token de Telegram inválido" });
    }

    const chatbot = await Chatbot.findOne({ _id: chatbotId, owner: req.user.id });
    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    // Guardamos el token validado
    chatbot.telegramToken = token;
    chatbot.telegramBotUsername = response.data.result.username; // opcional, útil para debug
    await chatbot.save();

    res.json({
      success: true,
      message: "Token de Telegram guardado correctamente",
      bot: response.data.result,
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
    const { message } = req.body;
    const bot = await Chatbot.findById(req.params.id).populate("user");
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    // Guardar mensaje del usuario
    await Conversation.create({
      bot: bot._id,
      sender: "user",
      message,
    });

    // Obtener respuesta IA
    let reply = await getGeminiReply(message, bot.prompts, bot.dataset);

    // Buscar servicio en dataset
    let selectedService = null;
    if (Array.isArray(bot.dataset)) {
      for (const row of bot.dataset) {
        if (
          row.servicio &&
          message.toLowerCase().includes(row.servicio.toLowerCase())
        ) {
          selectedService = row;
          break;
        }
      }
    }

    // Si el usuario pregunta por precio/duración del servicio
    if (selectedService) {
      const priceRegex = /precio|cuesta|cost/i;
      const durationRegex = /duración|dura|tiempo/i;

      if (priceRegex.test(message)) {
        reply = `${selectedService.servicio} cuesta ${selectedService.precio} € y dura ${selectedService.duracion} minutos.`;
      } else if (durationRegex.test(message)) {
        reply = `${selectedService.servicio} dura ${selectedService.duracion} minutos y cuesta ${selectedService.precio} €.`;
      }
    }

    // Detectar cita
    const citaOK = /cita (confirmada|agendada|programada)/i.test(reply);
    if (citaOK && selectedService && bot.user.googleTokens) {
      const owner = bot.user;
      const duration = parseInt(selectedService.duracion) || 30;
      const buffer = 10; // minutos de buffer entre citas

      // Detectar fecha/hora de la cita
      const { start, end } = parseDate(message);
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
        return res.json({
          reply: `Lo siento, no hay disponibilidad para "${selectedService.servicio}" en ese horario. Por favor, sugiere otra hora.`,
        });
      }

      // Crear evento
      const link = await addCalendarEvent({
        tokens: owner.googleTokens,
        summary: `Cita: ${selectedService.servicio}`,
        description: `Mensaje: "${message}"\nBot: "${reply}"`,
        durationMinutes: duration,
      });

      await sendEmail({
        to: owner.email,
        subject: `Nueva cita agendada (${bot.name})`,
        text: `Cita añadida a tu Google Calendar:\n${link}\n\nMensaje cliente:\n"${message}"`,
      });
    }

    // Guardar respuesta del bot
    await Conversation.create({
      bot: bot._id,
      sender: "bot",
      message: reply,
    });

    return res.json({ reply });
  } catch (e) {
    console.error("Error in /reply:", e);
    return res.status(500).json({ message: "Couldn't generate message" });
  }
});




router.get("/:id/conversations/export", async (req, res) => {
  const { format = "csv" } = req.query;
  const { id } = req.params;

  try {
    const conversations = await Conversation.find({ bot: id }).sort({
      timestamp: 1,
    });
    if (format === "json") {
      return res.json(conversations);
    }
    const fields = ["timestamp", "sender", "message"];
    const parser = new Parser({ fields });
    const csv = parser.parse(conversations);

    res.header("Content-Type", "text/csv");
    res.attachment(`chatbot-${id}-conversations.csv`);
    return res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
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
