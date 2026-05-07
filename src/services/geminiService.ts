import { GoogleGenAI, Type } from "@google/genai";
import { Category, Difficulty, Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function generateDailyQuestion(category: Category): Promise<Partial<Question>> {
  const prompt = `Generate a thought-provoking, engaging dinner table conversation starter for the category: ${category}. 
  The question should be suitable for a daily rotation.
  Return a JSON object with: 
  - text: the question text
  - difficulty: "Light", "Deep", or "Random"
  - category: "${category}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ["Light", "Deep", "Random"] },
            category: { type: Type.STRING }
          },
          required: ["text", "difficulty", "category"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini failed to generate question:", error);
    return {
      text: "What is one thing you're grateful for today?",
      difficulty: "Light",
      category
    };
  }
}
