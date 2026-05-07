import { GoogleGenAI, Type } from "@google/genai";
import { Category, Difficulty, Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function generateDailyQuestion(category: Category, difficulty: Difficulty): Promise<Partial<Question & { imagePrompt: string }>> {
  const prompt = `Generate a thought-provoking, engaging dinner table conversation starter for the category: ${category} and difficulty level: ${difficulty}. 
  The question should be suitable for a daily rotation.
  Also generate a detailed image prompt for a background image that reflects the mood of the question. 
  The image should be in a minimalist, editorial, high-end photography style with plenty of negative space for text overlay.
  Return a JSON object with: 
  - text: the question text
  - difficulty: "${difficulty}"
  - category: "${category}"
  - imagePrompt: a descriptive prompt for an image generator (Imagen)`;

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
            category: { type: Type.STRING },
            imagePrompt: { type: Type.STRING }
          },
          required: ["text", "difficulty", "category", "imagePrompt"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini failed to generate question:", error);
    return {
      text: "What is one thing you're grateful for today?",
      difficulty: "Light",
      category,
      imagePrompt: "A serene, minimalist flat lay of a simple ceramic bowl on a linen tablecloth, soft natural lighting, high-end editorial photography."
    };
  }
}

export async function generateQuestionImage(imagePrompt: string): Promise<string | undefined> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ text: imagePrompt }],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Gemini failed to generate image:", error);
  }
  return undefined;
}
