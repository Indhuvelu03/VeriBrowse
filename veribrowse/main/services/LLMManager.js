import { GoogleGenerativeAI } from '@google/generative-ai';
import { tools } from './tools/toolDefinitions.js';

/**
 * LLMManager (Gemini integration with OpenRouter Fallback)
 * Decides tools, reasons, summarizes, and responds.
 * Implements a global single-request queue.
 */
export default class LLMManager {
    constructor(apiKey, openRouterKey = null) {
        if (!apiKey) {
            throw new Error('Gemini API key is required for VeriBrowse to function.');
        }

        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);

        this.systemPrompt = this.buildSystemPrompt();

        // Core Agent Model (Support Function Calling)
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            tools: [{ functionDeclarations: tools }],
            systemInstruction: {
                role: 'system',
                parts: [{ text: this.systemPrompt }]
            },
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
            }
        });

        // Lightweight Model for Prompt Refinement
        this.simpleModel = this.genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
            }
        });

        // State Tracking
        this.conversationHistory = [];

        // Global Request Queue
        this.requestQueue = [];
        this.isProcessing = false;

        // OpenRouter Configuration
        this.openRouterKey = openRouterKey || process.env.OPENROUTER_API_KEY || null;
        this.openRouterModel = 'openrouter/auto'; // Fallback model — auto-selects best available free endpoint
    }

    /**
     * Builds the comprehensive agent system instructions
     */
    buildSystemPrompt() {
        return `You are VeriBrowse, an advanced AI browser agent. You help users by performing research, navigating websites, and extracting data.

OPERATIONAL PRINCIPLES:
1. **Search & Research**: Use 'web_search' for searching. It returns structured results via API.
2. **Navigation**: Use 'open_page' to go to specific URLs.
3. **Extraction**: Use 'extract_content' to get clean text from the current page.
4. **Interaction**: Use 'web_click', 'web_fill_form', and 'web_scroll' for page interactions.

AVAILABLE TOOLS:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Always be accurate, extremely concise, and professional.`;
    }

    /**
     * Enqueues a chat request to be processed sequentially.
     */
    /**
     * Queued tool-calling chat — goes through queue → Gemini (with tools) → OpenRouter fallback.
     * Used by the old reactive agent loop (kept for compatibility).
     */
    async chat(userMessage, mode = 'auto') {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ type: 'tool', userMessage, mode, resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Queued plain-text chat — goes through queue → Gemini (simpleModel) → OpenRouter fallback.
     * Used by PlannerService (JSON plan) and AgentLoop (final summary).
     * Returns a plain string, not a { type, text } object.
     */
    async chatText(prompt) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ type: 'text', userMessage: prompt, mode: 'text', resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Processes the queue FIFO.
     * Routes each request to the correct execution path based on its type.
     */
    async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) return;

        this.isProcessing = true;
        const request = this.requestQueue.shift();

        try {
            let response;
            if (request.type === 'text') {
                // Plain-text path: no function tools, returns a string
                response = await this.executeTextWithFallback(request.userMessage);
            } else {
                // Tool-calling path: returns { type, text, functionCalls? }
                response = await this.executeWithFallback(request.userMessage, request.mode);
            }
            request.resolve(response);
        } catch (error) {
            request.reject(error);
        } finally {
            this.isProcessing = false;
            if (this.requestQueue.length > 0) {
                this.processQueue();
            }
        }
    }

    /**
     * Plain-text execution: Gemini simpleModel first, then OpenRouter fallback.
     * Always returns a plain string.
     */
    async executeTextWithFallback(prompt) {
        try {
            return await this._executeGeminiText(prompt);
        } catch (error) {
            if (this.shouldFallback(error)) {
                console.warn(`[LLMManager] Gemini text failed (${error.message}). Falling back to OpenRouter.`);
                try {
                    return await this._executeOpenRouterText(prompt);
                } catch (fallbackError) {
                    console.error('[LLMManager] OpenRouter text fallback also failed:', fallbackError.message);
                    throw new Error(`Primary and fallback both failed. Gemini: ${error.message}`);
                }
            }
            throw error;
        }
    }

    /**
     * Plain-text Gemini call using simpleModel (no function declarations).
     */
    async _executeGeminiText(prompt) {
        console.log('[LLMManager] Gemini text call (simpleModel)...');
        const result = await this.simpleModel.generateContent(prompt);
        return result.response.text().trim();
    }

    /**
     * Plain-text OpenRouter fallback (no tools, single-turn).
     */
    async _executeOpenRouterText(prompt) {
        if (!this.openRouterKey) {
            throw new Error('OpenRouter API key not configured for fallback.');
        }
        console.log('[LLMManager] OpenRouter text fallback...');
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openRouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://veribrowse.com',
                'X-Title': 'VeriBrowse'
            },
            body: JSON.stringify({
                model: this.openRouterModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 2048
            })
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenRouter text error: ${response.status} — ${err}`);
        }
        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || '';
    }

    /**
     * Tries Gemini, falls back to OpenRouter on specific errors.
     */
    async executeWithFallback(userMessage, mode) {
        try {
            return await this._executeGemini(userMessage, mode);
        } catch (error) {
            // Check if error is recoverable via fallback (429, 503, Network)
            if (this.shouldFallback(error)) {
                console.warn(`[LLMManager] Gemini failed with ${error.message}. Fallback to OpenRouter.`);
                try {
                    return await this._executeOpenRouter(userMessage, mode);
                } catch (fallbackError) {
                    // If fallback fails, return original error or a combined one
                    console.error('[LLMManager] OpenRouter Fallback also failed:', fallbackError);
                    throw new Error(`Primary and Fallback failed. Gemini: ${error.message}`);
                }
            }
            throw error;
        }
    }

    /**
     * Executes request using Gemini (Primary)
     */
    async _executeGemini(userMessage, mode) {
        console.log(`[LLMManager] Gemini Turn. Length: ${userMessage.length}`);

        const chat = this.model.startChat({
            history: this.conversationHistory,
            systemInstruction: {
                role: 'system',
                parts: [{ text: this.systemPrompt + (mode !== 'auto' ? `\n\nCURRENT MODE: ${mode.toUpperCase()}` : '') }]
            }
        });

        const result = await chat.sendMessage(userMessage);
        const response = result.response;

        // Update history from Gemini's internal state
        this.conversationHistory = await chat.getHistory();

        const functionCalls = this.extractFunctionCalls(response);

        if (functionCalls.length > 0) {
            return {
                type: 'function_call',
                text: response.text() || `Executing ${functionCalls.length} tools...`,
                functionCalls: functionCalls
            };
        }

        return {
            type: 'text',
            text: response.text()
        };
    }

    /**
     * Executes request using OpenRouter (Fallback)
     */
    async _executeOpenRouter(userMessage, mode) {
        if (!this.openRouterKey) {
            throw new Error('OpenRouter API Key not configured for fallback.');
        }

        console.log(`[LLMManager] OpenRouter Turn. Length: ${userMessage.length}`);

        // Convert history to OpenAI format
        const messages = this.convertHistoryToOpenAI();

        // Add System Prompt
        messages.unshift({
            role: 'system',
            content: this.systemPrompt + (mode !== 'auto' ? `\n\nCURRENT MODE: ${mode.toUpperCase()}` : '')
        });

        // Add current user message
        messages.push({ role: 'user', content: userMessage });

        // Call OpenRouter
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openRouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://veribrowse.com', // Site URL
                'X-Title': 'VeriBrowse'
            },
            body: JSON.stringify({
                model: this.openRouterModel,
                messages: messages,
                tools: tools.map(t => ({
                    type: 'function',
                    function: t
                })),
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[LLMManager] OpenRouter Raw Error:', errorText);
            throw new Error(`OpenRouter Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const choice = data.choices[0];
        const message = choice.message;

        // Manually update history since we bypassed Gemini SDK
        this.conversationHistory.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        const toolCalls = message.tool_calls;
        let finalResponse = { type: 'text', text: message.content || '' };

        if (toolCalls && toolCalls.length > 0) {
            // Map OpenAI tool calls to Gemini format
            const mappedCalls = toolCalls.map(tc => ({
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
            }));

            finalResponse = {
                type: 'function_call',
                text: message.content || `Executing ${mappedCalls.length} tools...`,
                functionCalls: mappedCalls
            };

            // Add model response to history
            this.conversationHistory.push({
                role: 'model',
                parts: [
                    { text: message.content || '' },
                    ...mappedCalls.map(c => ({
                        functionCall: {
                            name: c.name,
                            args: c.args
                        }
                    }))
                ]
            });

        } else {
            // Add text-only response to history
            this.conversationHistory.push({
                role: 'model',
                parts: [{ text: message.content }]
            });
        }

        return finalResponse;
    }

    shouldFallback(error) {
        const msg = error.message.toLowerCase();
        return (
            msg.includes('429') ||
            msg.includes('quota') ||
            msg.includes('network') ||
            msg.includes('fetch failed') ||
            msg.includes('503') ||
            msg.includes('400') // Handle invalid key as fallback trigger
        );
    }

    convertHistoryToOpenAI() {
        return this.conversationHistory.map(turn => {
            let role = turn.role === 'model' ? 'assistant' : turn.role;
            let content = '';

            // Extract text parts
            const textPart = turn.parts.find(p => p.text);
            if (textPart) content = textPart.text;

            // Flatten function calls/responses into text to preserve context
            const funcCall = turn.parts.find(p => p.functionCall);
            if (funcCall) {
                content += `\n[System Log: AI called tool ${funcCall.functionCall.name} with args ${JSON.stringify(funcCall.functionCall.args)}]`;
            }

            const funcResp = turn.parts.find(p => p.functionResponse);
            if (funcResp) {
                role = 'user'; // Treat tool response as user/system info
                content += `\n[System Log: Tool ${funcResp.functionResponse.name} returned: ${JSON.stringify(funcResp.functionResponse.response)}]`;
            }

            // OpenAI doesn't support 'function' role in this context without ids
            if (role === 'function') role = 'user';

            return { role, content: content || '(No content)' };
        });
    }

    /**
     * Adds tool execution results to the conversation history
     */
    async addToolResponse(toolResults) {
        try {
            console.log(`[LLMManager] Adding ${toolResults.length} tool results to history.`);

            const functionParts = toolResults.map(tr => ({
                functionResponse: {
                    name: tr.tool,
                    response: {
                        name: tr.tool,
                        content: this.compressResult(tr.result)
                    }
                }
            }));

            this.conversationHistory.push({
                role: 'function',
                parts: functionParts
            });

            return `Processed ${toolResults.length} results.`;

        } catch (error) {
            console.error('[LLMManager] addToolResponse Error:', error);
            return 'Error processing tool results.';
        }
    }

    extractFunctionCalls(response) {
        const calls = [];
        try {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall) {
                        calls.push({
                            name: part.functionCall.name,
                            args: part.functionCall.args || {}
                        });
                    }
                }
            }
        } catch (e) {
            console.error('[LLMManager] Failed to extract function calls:', e);
        }
        return calls;
    }

    compressResult(result) {
        if (!result) return 'No result returned.';
        if (typeof result === 'string') return result.substring(0, 500);
        if (result.results && Array.isArray(result.results)) {
            return result.results.slice(0, 3).map(r => ({
                t: r.title,
                u: r.url,
                s: r.snippet?.substring(0, 150)
            }));
        }
        if (result.textContent) {
            return result.textContent.substring(0, 1000) + '... (truncated)';
        }
        return JSON.stringify(result).substring(0, 500);
    }

    async refinePrompt(userPrompt) {
        try {
            const prompt = `Refine this browser agent instruction to be more precise: "${userPrompt}". Target: 2 sentences max.`;
            const result = await this.simpleModel.generateContent(prompt);
            return {
                original: userPrompt,
                refined: result.response.text().trim()
            };
        } catch (error) {
            return { original: userPrompt, refined: userPrompt };
        }
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    getHistory() { return this.conversationHistory; }
}
