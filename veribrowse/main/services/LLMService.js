import { GoogleGenerativeAI } from '@google/generative-ai';
import Store from 'electron-store';

const store = new Store();
const MODEL_NAME = 'gemini-2.0-flash';

function getModel() {
    const apiKey = store.get('geminiApiKey');
    if (!apiKey) {
        throw new Error('[LLMService] Gemini API Key not found in store.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.2,
        },
    });
}

async function withRetry(fn) {
    try {
        return await fn();
    } catch (err) {
        console.warn('[LLMService] Attempt 1 failed, retrying...', err.message);
        try {
            return await fn();
        } catch (retryErr) {
            console.error('[LLMService] Final attempt failed:', retryErr.message);
            throw retryErr;
        }
    }
}

export async function generate(prompt, options = {}) {
    return withRetry(async () => {
        const model = getModel();
        const result = await model.generateContent(prompt);
        return result.response.text();
    });
}

export async function vision(prompt, base64PNG) {
    return withRetry(async () => {
        // Ensure we have a raw base64 string (no data:image/png;base64, prefix)
        let cleanBase64 = typeof base64PNG === 'string' ? base64PNG : '';
        if (cleanBase64.includes(';base64,')) {
            cleanBase64 = cleanBase64.split(';base64,')[1];
        }

        const model = getModel();
        const result = await model.generateContent([
            { text: prompt },
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64,
                },
            },
        ]);
        return result.response.text();
    });
}

export async function generateJSON(prompt, schema = {}) {
    const jsonInstruction = `Return ONLY valid JSON. No markdown, no code fences, no explanation. Pure JSON only.`;
    const fullPrompt = `${prompt}\n\n${jsonInstruction}`;

    return withRetry(async () => {
        const model = getModel();
        const result = await model.generateContent(fullPrompt);
        const raw = result.response.text();

        // Strip ALL markdown fence variants:
        //   ```json ... ```, ``` ... ```, ~~~json ... ~~~, leading/trailing whitespace
        const cleaned = raw
            .replace(/^[`~]{3,}(?:json)?\s*/i, '')  // opening fence
            .replace(/\s*[`~]{3,}\s*$/i, '')          // closing fence
            .trim();

        // DEBUG — always log in dev so parse errors are diagnosable
        if (process.env.NODE_ENV !== 'production') {
            console.log('[LLMService:generateJSON] Raw response (first 400 chars):', raw.slice(0, 400));
            console.log('[LLMService:generateJSON] Cleaned for parse:', cleaned.slice(0, 400));
        }

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // Log the full raw response so we can see what went wrong
            console.error('[LLMService:generateJSON] JSON.parse failed. Full raw response:');
            console.error(raw);
            throw new Error(`[LLMService] JSON parse failed. First 200 chars: ${raw.slice(0, 200)}`);
        }
    });
}
