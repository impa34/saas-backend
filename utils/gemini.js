import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function getGeminiReply(message, prompts = [], dataset = []) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const promptLines = prompts
  .map((p) => `User: ${p.question}\nBot: ${p.answer}`)
  .join("\n");

const systemPrompt = `
Eres un asistente de chat llamado Talobot.
Responde de forma breve y natural al usuario.
No repitas la pregunta del usuario, no uses formato Q:/A:, 
y responde directamente.
`;
  const datasetLines = dataset
    .map((entry) => {
      return Object.entries(entry)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");
    })
    .join("\n");

  const context = [systemPrompt, promptLines, datasetLines].join("\n");

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: context }],
      },
    ],
  });

 const fullPrompt = `${context}\nUser: ${message}\nBot:`;
  const result = await chat.sendMessage(fullPrompt);
  const response = await result.response;
  return response.text();
}
