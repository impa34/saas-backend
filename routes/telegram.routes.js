// routes/telegram.js
import express from "express";
import axios from "axios";

const router = express.Router();

// Para guardar bots/usuarios conectados en DB
// Aquí luego lo puedes relacionar con tu modelo de Chatbot
router.post("/webhook", async (req, res) => {
  const message = req.body.message;

  if (!message || !message.chat || !message.text) {
    return res.sendStatus(200); // ignora si no es mensaje válido
  }

  const chatId = message.chat.id;
  const text = message.text;

  // Aquí podrías conectar con tu lógica de chatbot
  const reply = `Recibí tu mensaje: "${text}" 🚀`;

  // Responder al usuario en Telegram
  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text: reply,
    }
  );

  res.sendStatus(200);
});

export default router;
