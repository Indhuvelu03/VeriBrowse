import { GoogleGenerativeAI } from '@google/generative-ai';

const OLLAMA_API_URL = 'http://localhost:11434/api';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// API Keys
const GEMINI_KEYS = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
].filter(Boolean);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

class AiService {
    constructor() {
        this.phi3Model = 'phi3';
        this.llavaModel = 'llava';
        this.currentKeyIndex = 0;
        this.geminiModel = null;
        this.ollamaAvailable = null; // cached status
        this._initGemini();
    }

    _initGemini() {
        if (GEMINI_KEYS.length === 0) return;
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_KEYS[this.currentKeyIndex]);
            this.geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        } catch (err) {
            console.error('[AiService] Failed to init Gemini:', err);
        }
    }

    _rotateGeminiKey() {
        if (GEMINI_KEYS.length <= 1) return false;
        this.currentKeyIndex = (this.currentKeyIndex + 1) % GEMINI_KEYS.length;
        this._initGemini();
        return true;
    }

    // ─── Priority: Ollama → OpenRouter → Gemini ───

    async runAgentTask(taskType, prompt) {
        // 1. Try Ollama (local, unlimited)
        try {
            const answer = await this.chatWithPhi3([{ role: 'user', content: prompt }]);
            console.log('[AiService] Response from Ollama (phi3)');
            return { success: true, answer, provider: 'ollama' };
        } catch (err) {
            console.warn('[AiService] Ollama failed:', err.message);
        }

        // 2. Try OpenRouter free tier
        if (OPENROUTER_KEY) {
            try {
                const answer = await this._chatOpenRouter(prompt);
                console.log('[AiService] Response from OpenRouter');
                return { success: true, answer, provider: 'openrouter' };
            } catch (err) {
                console.warn('[AiService] OpenRouter failed:', err.message);
            }
        }

        // 3. Try Gemini (rate-limited free tier)
        // Try current key → rotate key → try flash-lite model as last resort
        if (GEMINI_KEYS.length > 0) {
            // Attempt with current key
            if (this.geminiModel) {
                try {
                    const result = await this.geminiModel.generateContent(prompt);
                    const text = result.response.text();
                    console.log('[AiService] Response from Gemini');
                    return { success: true, answer: text, provider: 'gemini' };
                } catch (err) {
                    console.warn('[AiService] Gemini key 1 failed:', err.message);
                }
            }

            // Rotate to second key
            if (this._rotateGeminiKey()) {
                try {
                    const result = await this.geminiModel.generateContent(prompt);
                    const text = result.response.text();
                    console.log('[AiService] Response from Gemini (rotated key)');
                    return { success: true, answer: text, provider: 'gemini' };
                } catch (err) {
                    console.warn('[AiService] Gemini key 2 failed:', err.message);
                }
            }

            // Last resort: try gemini-2.0-flash-lite (lower quota usage)
            try {
                const genAI = new GoogleGenerativeAI(GEMINI_KEYS[0]);
                const liteModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
                const result = await liteModel.generateContent(prompt);
                const text = result.response.text();
                console.log('[AiService] Response from Gemini (flash-lite fallback)');
                return { success: true, answer: text, provider: 'gemini-lite' };
            } catch (err) {
                console.warn('[AiService] Gemini flash-lite failed:', err.message);
            }
        }

        return { success: false, error: 'All AI providers failed. Make sure Ollama is running, or check your API keys.' };
    }

    // ─── OpenRouter Free Tier ───
    // Free models rotate/disappear — try multiple fallbacks

    static OPENROUTER_FREE_MODELS = [
        'deepseek/deepseek-r1-0528:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'stepfun/step-3.5-flash:free',
        'z-ai/glm-4.5-air:free',
    ];

    async _chatOpenRouter(prompt) {
        let lastError = null;

        for (const model of AiService.OPENROUTER_FREE_MODELS) {
            try {
                const response = await fetch(OPENROUTER_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_KEY}`,
                        'HTTP-Referer': 'http://localhost',
                        'X-Title': 'VeriBrowse',
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    console.warn(`[AiService] OpenRouter model ${model} failed: ${response.status}`);
                    lastError = new Error(`OpenRouter ${response.status}: ${errBody}`);
                    continue; // try next model
                }

                const data = await response.json();
                console.log(`[AiService] OpenRouter model used: ${model}`);
                return data.choices[0].message.content;
            } catch (err) {
                console.warn(`[AiService] OpenRouter model ${model} error:`, err.message);
                lastError = err;
            }
        }

        throw lastError || new Error('All OpenRouter free models failed');
    }

    // ─── Health Check ───

    async healthCheck() {
        const status = { ollama: false, openrouter: false, gemini: false };

        // Ollama
        const ollamaStatus = await this.checkOllamaStatus();
        status.ollama = ollamaStatus.running || false;

        // OpenRouter
        if (OPENROUTER_KEY) {
            try {
                const r = await fetch('https://openrouter.ai/api/v1/models', {
                    headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}` },
                });
                status.openrouter = r.ok;
            } catch (_) {}
        }

        // Gemini
        if (this.geminiModel) {
            try {
                await this.geminiModel.generateContent('hi');
                status.gemini = true;
            } catch (_) {}
        }

        return { success: status.ollama || status.openrouter || status.gemini, ...status };
    }

    async checkOllamaStatus() {
        try {
            const response = await fetch(`${OLLAMA_API_URL}/tags`);
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    models: data.models || [],
                    running: true
                };
            }
            return { success: false, running: false };
        } catch (error) {
            return { success: false, running: false, error: error.message };
        }
    }

    async chatWithPhi3(messages) {
        try {
            const controller = new AbortController();
            const timeoutMs = 120000; // 120s — generous for cold starts
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(`${OLLAMA_API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.phi3Model,
                    messages: messages,
                    stream: false,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Phi-3 API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.message.content;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`Phi-3 timed out after 120s`);
                throw new Error('Ollama timed out. The model may be loading or overloaded.');
            }
            console.error('Phi-3 error:', error);
            throw error;
        }
    }

    async analyzeImageWithLlava(imageBase64, prompt) {
        try {
            const response = await fetch(`${OLLAMA_API_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.llavaModel,
                    prompt: prompt,
                    images: [imageBase64],
                    stream: false,
                }),
            });

            if (!response.ok) {
                throw new Error(`LLaVA API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('LLaVA error:', error);
            throw error;
        }
    }

    async chatWithVision(messages, images = []) {
        if (images && images.length > 0) {
            const lastMessage = messages[messages.length - 1];
            return await this.analyzeImageWithLlava(images[0], lastMessage.content);
        }
        return await this.chatWithPhi3(messages);
    }
}

export default new AiService();
