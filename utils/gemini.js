import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function getGeminiReply(message, prompts = [], dataset = []) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const promptLines = prompts
    .map((p) => `Q: ${p.question}\nA: ${p.answer}`)
    .join("\n");

  const datasetLines = dataset
    .map((entry) => {
      return Object.entries(entry)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");
    })
    .join("\n");

  const context = [...promptLines, ...datasetLines].join("\n");

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: context }],
      },
    ],
  });

  const fullPrompt = `${context}\nQ: ${message}\nA:`;
  const result = await chat.sendMessage(fullPrompt);
  const response = await result.response;
  return response.text();
}
