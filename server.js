import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.routes.js";
import chatRoutes from "./routes/chatbot.routes.js";
import googleRoutes from "./routes/googleAuth.routes.js";
import paymentRoutes from "./routes/payment.routes.js"
import userRoutes from "./routes/user.routes.js"
import adminRoutes from "./routes/admin.routes.js"
import telegramRoutes from "./routes/telegram.routes.js";
import checkoutRoutes from "./routes/checkout.routes.js"
import path from "path";
import healthRoutes from "./routes/health.routes.js"
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { webhookHandler } from "./routes/payment.routes.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.post("/api/stripe/webhook", bodyParser.raw({ type: "application/json" }), webhookHandler);

app.use(express.json());
app.use(cors({
  origin: ["https://talochatbot.com", "https://www.talochatbot.com"],
  credentials: true,
}));

app.use("/api/auth", authRoutes);
app.use("/api/google-auth", googleRoutes);
app.use("/api/chatbots", chatRoutes);
app.use("/api/stripe", paymentRoutes);
app.use("/api/paypal", checkoutRoutes);
app.use("/api/user", userRoutes)
app.use("/api/admin", adminRoutes)
app.use("/", healthRoutes)

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

app.post("/telegram/webhook", async (req, res) => {
  try {
    const { message } = req.body;

    if (message && message.text) {
      const chatId = message.chat.id;
      const text = message.text;

      // Aquí decides qué responder
      let reply = "No te entendí 🤖";
      if (text.toLowerCase().includes("hola")) {
        reply = "¡Hola! Soy tu chatbot en Telegram 👋";
      }

      // Enviar respuesta a Telegram
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply,
        }),
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook Telegram:", err);
    return res.sendStatus(500);
  }
});

app.use(express.static(path.join(__dirname, "../client/dist")));
app.use(express.static(path.join(__dirname, "../client/public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname,"..","client", "dist", "index.html"));
});



mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("DB connected");

    app.listen(3000, () => {
      console.log("Server on port 3000");
      setTimeout(() => {
        if (!app._router) {
          console.error("app._router todavía no existe.");
          return;
        }
      }, 100);
    });
  })
  .catch((e) => console.error(e));
