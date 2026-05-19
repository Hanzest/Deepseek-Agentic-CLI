import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: process.env.GEMINI_BASE_URL
});

async function main() {
    const stream = await openai.chat.completions.create({
    model: "gemini-3-flash-preview",
    messages: [
      { role: "user", content: "Solve this riddle step-by-step: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" }
    ],
    reasoning_effort: "minimal", 
    stream: true,
  });

  for await (const chunk of stream) {
    const reasoning = chunk.choices[0]?.delta?.reasoning_content;
    const content = chunk.choices[0]?.delta?.content;

    // 1. Capture and print the raw thinking process tokens first
    if (reasoning) {
      process.stdout.write(reasoning); 
    }
    
    // 2. Capture and print the actual response tokens immediately following
    if (content) {
      process.stdout.write(content); 
    }
  }
}

main();