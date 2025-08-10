

import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const API_KEYS = (process.env.API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
let currentKeyIndex = 0;

if (API_KEYS.length === 0) {
    console.error("AI Service: No API keys found in process.env.API_KEY");
}

const getClient = (): GoogleGenAI | null => {
    if (API_KEYS.length === 0) return null;
    return new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] });
};

const rotateKey = () => {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.warn(`AI Service: Rotated to API key index ${currentKeyIndex}`);
};

const performRequest = async <T,>(request: (client: GoogleGenAI) => Promise<T>): Promise<T> => {
    if (!navigator.onLine) {
        throw new Error("You are offline. AI features require an internet connection.");
    }

    if (API_KEYS.length === 0) {
        throw new Error("No API keys configured.");
    }

    const initialKeyIndex = currentKeyIndex;
    let attempts = 0;

    while (attempts < API_KEYS.length) {
        try {
            const client = getClient();
            if (!client) throw new Error("Could not initialize AI client.");
            return await request(client);
        } catch (error: any) {
            console.error(`AI Service: API request failed with key index ${currentKeyIndex}.`, error);
            attempts++;
            if (attempts < API_KEYS.length) {
                rotateKey();
            } else {
                console.error("AI Service: All API keys failed.");
                currentKeyIndex = initialKeyIndex;
                throw error;
            }
        }
    }
    throw new Error("All API keys failed and exhausted attempts.");
};

export const aiService = {
    generateContent: async (prompt: any, useSearch: boolean = false): Promise<GenerateContentResponse> => {
        return performRequest(client => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            ...(useSearch && { config: { tools: [{ googleSearch: {} }] } }),
        }));
    },

    generateImages: async (prompt: string): Promise<{ generatedImages: { image: { imageBytes: string } }[] }> => {
        return performRequest(client => client.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
            },
        })) as unknown as Promise<{ generatedImages: { image: { imageBytes: string } }[] }>;
    },
    
    createChat: (systemInstruction: string): Chat | null => {
        const client = getClient();
        if (!client) return null;
        // Note: Chat sessions are tied to a specific client instance.
        // The resilient retry logic won't apply to subsequent messages in the same chat.
        return client.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
        });
    },
};
