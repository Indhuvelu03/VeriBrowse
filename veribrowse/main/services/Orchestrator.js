/**
 * Orchestrator - Central Decision-Making System
 * 
 * Date: February 7, 2026
 * 
 * ORCHESTRATOR-CENTRIC ARCHITECTURE
 * phi3 = reasoning engine (brain), NOT knowledge source
 * SearchService = internet access (eyes)
 * CrawlerService = content extraction (reading)
 * Orchestrator = controller (decision-making)
 * 
 * All knowledge queries use RAG:
 * User → Orchestrator → SearchService → CrawlerService → phi3(context + question) → Answer
 * 
 * Routing Table:
 * | Task               | Tool/Model          |
 * |--------------------|---------------------|
 * | Navigation         | Executor (no model) |
 * | Search             | Search (no model)   |
 * | Extract            | Crawler (no model)  |
 * | Summarize          | RAG → phi3          |
 * | Report             | RAG → phi3          |
 * | Question           | RAG → phi3          |
 * | Research           | RAG → phi3          |
 * | Screenshot/Vision  | llava               |
 * | Memory Store       | MiniLM (embedding)  |
 * | Memory Search      | MiniLM (embedding)  |
 */

import aiService from './AiService';
import memoryService from './MemoryService';
import searchService from './SearchService';
import crawlerService from './CrawlerService';
import automationService from './AutomationService';

// ─── Structured Prompt Templates ───
// Forces phi3 to respond with formatted markdown, not plain paragraphs

const PROMPT_TEMPLATES = {

    SUMMARY: (content, query) => `You are a helpful assistant. Respond using clear **Markdown formatting**.

# Summary

Provide a well-structured summary of the following content.

## Instructions
- Use **headings** (##) to organize sections
- Use **bullet points** for key facts
- Use **bold** for important terms
- Keep it concise but comprehensive

## Content
${content}

## User Question
${query}

Respond with a formatted summary now:`,

    RESEARCH: (content, query) => `You are a research assistant. Respond using clear **Markdown formatting**.

# Research Report: ${query}

Based on the following real-time information, provide a comprehensive report.

## Instructions
- Start with an **Overview** section
- Include **Key Findings** with bullet points
- Add **Analysis** with insights
- End with a **Conclusion**
- Use **bold** for important terms and names
- Use numbered lists where appropriate

## Source Data
${content}

Respond with the formatted research report now:`,

    EXPLANATION: (content, query) => `You are a helpful assistant. Respond using clear **Markdown formatting**.

# ${query}

## Instructions
- Explain clearly using **headings** and **subheadings**
- Use **bullet points** for lists
- Use **bold** for key terms
- Use code blocks for any technical content
- Keep paragraphs short (2-3 sentences max)

${content ? `## Reference Information\n${content}\n\n` : ''}Answer the question using the information above. Respond with formatted explanation now:`,

    GENERAL: (content, query) => `You are a helpful assistant. Always respond using clear **Markdown formatting**.

## Instructions
- Use **headings** (##) to organize your response
- Use **bullet points** for lists of items
- Use **bold** for important terms
- Use numbered lists for steps or sequences
- Keep paragraphs short and clear

${content ? `## Context (latest real-time data)\n${content}\n\n` : ''}## Question
${query}

Respond with a well-formatted answer now:`,

    COMPARISON: (content, query) => `You are a helpful assistant. Respond using clear **Markdown formatting**.

# Comparison: ${query}

## Instructions
- Use a **table** if comparing features
- Use **pros/cons** lists
- Highlight **key differences** in bold
- End with a **recommendation**

## Source Data
${content}

Respond with the formatted comparison now:`,
};

export class Orchestrator {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.sessionContexts = new Map();
        this.progressCallback = null;
    }

    // ─── Progress reporting ───

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    _progress(message, phase = 'working') {
        console.log(`[Orchestrator] ${message}`);
        if (this.progressCallback) {
            this.progressCallback({ message, phase });
        }
    }

    // ─── Prompt Template Selection ───

    _detectPromptType(query) {
        const q = (query || '').toLowerCase();
        if (/summarize|summary|tldr|sum up/i.test(q)) return 'SUMMARY';
        if (/research|investigate|explore|deep dive|report on/i.test(q)) return 'RESEARCH';
        if (/compare|vs|versus|difference between|better/i.test(q)) return 'COMPARISON';
        if (/what is|who is|explain|how does|why|define|meaning/i.test(q)) return 'EXPLANATION';
        return 'GENERAL';
    }

    _buildPrompt(type, content, query) {
        const builder = PROMPT_TEMPLATES[type] || PROMPT_TEMPLATES.GENERAL;
        return builder(content, query);
    }

    // ─── Strict Intent Classification ───
    // Separates ACTION tasks (no AI) from THINK tasks (AI required)
    //
    // ACTION → tool only (search, navigate, open, click)
    // THINK  → model only (explain, think)
    // ANALYZE → tool + model (summarize, research, compare)

    _classifyMissionIntent(prompt) {
        const text = (prompt || '').trim().toLowerCase();

        // Direct URL → NAVIGATE
        if (/^https?:\/\//i.test(text)) {
            return { type: 'NAVIGATE', url: text, query: text };
        }

        // Domain → NAVIGATE
        if (/^[\w-]+\.(com|ai|io|org|net|dev|co|app)$/i.test(text)) {
            return { type: 'NAVIGATE', url: `https://${text}`, query: text };
        }

        // "open [url/domain]" → NAVIGATE
        const openMatch = text.match(/^(?:open|go to|visit|navigate to)\s+(.+)/i);
        if (openMatch) {
            const target = openMatch[1].trim();
            if (/^https?:\/\//i.test(target) || /^[\w-]+\.(com|ai|io|org|net|dev|co|app)/i.test(target)) {
                const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
                return { type: 'NAVIGATE', url, query: target };
            }
            // "open X" where X is not a URL → search + open first result
            return { type: 'SEARCH_AND_OPEN', query: target };
        }

        // "search [query]" or "find [query]" or "look up [query]" → SEARCH (tool only)
        const searchMatch = text.match(/^(?:search|search for|find|look up|google|browse)\s+(.+)/i);
        if (searchMatch) {
            return { type: 'SEARCH', query: searchMatch[1].trim() };
        }

        // "summarize" / "summary" → ANALYZE (tool + model)
        if (/summarize|summary|tldr|sum up/i.test(text)) {
            // Check if it says "summarize this page" (no search needed) vs "summarize X" (search first)
            if (/this page|current page|the page/i.test(text)) {
                return { type: 'SUMMARIZE_PAGE', query: text };
            }
            return { type: 'ANALYZE', query: text };
        }

        // Research / investigate / explore / compare → ANALYZE
        if (/research|investigate|explore|compare|analyze|report on|deep dive/i.test(text)) {
            return { type: 'ANALYZE', query: text };
        }

        // Think / explain → THINK (model only, no browsing)
        if (/^(?:think|explain|tell me about|describe|what is|who is|how to|how does|why)/i.test(text)) {
            return { type: 'THINK', query: text };
        }

        // Multi-step: "search X and open first link and summarize"
        if (/search.*and.*open.*and.*(summarize|summary)/i.test(text)) {
            const query = text.replace(/^search\s+/i, '').replace(/\s+and\s+open.*$/i, '').trim();
            return { type: 'SEARCH_OPEN_SUMMARIZE', query };
        }

        // Multi-step: "search X and open first link"
        if (/search.*and.*open.*(1st|first|top)/i.test(text)) {
            const query = text.replace(/^search\s+/i, '').replace(/\s+and\s+open.*$/i, '').trim();
            return { type: 'SEARCH_AND_OPEN', query };
        }

        // Default: treat as SEARCH (tool only, no AI)
        return { type: 'SEARCH', query: text };
    }

    // ─── RAG: Retrieval-Augmented Generation ───
    // Only used for ANALYZE/THINK tasks where AI is needed

    /**
     * Answer any question using live web data + phi3 reasoning (RAG pipeline).
     * Used for both chat queries and mission summarization.
     * @param {string} query - User's question
     * @param {WebContents|null} webContents - Optional tab to use for searching
     * @returns {{ success: boolean, answer?: string, sources?: string[], error?: string }}
     */
    async answerWithRAG(query, webContents = null) {
        try {
            console.log('[Orchestrator] RAG pipeline starting for:', query);

            // Step 1: Determine if we need live web data
            const needsWebData = this._needsLiveData(query);

            let webContent = '';
            let sources = [];

            if (needsWebData && webContents) {
                // Step 2: Search the web
                const searchUrl = searchService.generateSearchUrl(query);
                this._progress?.('Searching the web…');

                await webContents.loadURL(searchUrl);
                await this._waitForLoad(webContents);

                // Step 3: Extract search results snippets directly from search page
                const searchPageData = await crawlerService.extractPageData(webContents);
                if (searchPageData.success && searchPageData.content) {
                    webContent = searchPageData.content.slice(0, 6000);
                    sources.push(webContents.getURL());
                }

                // Step 4: Open the first result for deeper content
                const links = await this._extractSearchResultLinks(webContents);
                if (links.length > 0) {
                    try {
                        this._progress?.(`Reading: ${links[0].text || links[0].href}…`);
                        await webContents.loadURL(links[0].href);
                        await this._waitForLoad(webContents);

                        const pageData = await crawlerService.extractPageData(webContents);
                        if (pageData.success && pageData.content) {
                            webContent += '\n\n--- Source: ' + pageData.title + ' ---\n' + pageData.content.slice(0, 6000);
                            sources.push(pageData.url);
                        }
                    } catch (navErr) {
                        console.warn('[Orchestrator] Failed to open first result:', navErr.message);
                    }
                }
            }

            // Step 5: Select prompt template and build prompt
            const promptType = this._detectPromptType(query);
            const fullPrompt = this._buildPrompt(promptType, webContent, query);

            // Step 6: Send to phi3 (via AiService fallback chain)
            this._progress?.('Generating answer…');
            const aiResult = await aiService.runAgentTask(promptType.toLowerCase(), fullPrompt);

            if (aiResult.success) {
                return { success: true, answer: aiResult.answer, sources, provider: aiResult.provider };
            }
            return { success: false, error: aiResult.error || 'AI generation failed' };

        } catch (error) {
            console.error('[Orchestrator] RAG pipeline error:', error);
            return { success: false, error: error.message };
        }
    }

    /** Check if a query needs fresh web data vs. can be answered from model knowledge */
    _needsLiveData(query) {
        const q = (query || '').toLowerCase();

        // Always needs web: current events, latest, news, prices, who is, today, 2025, 2026
        const livePatterns = [
            /latest|newest|recent|current|today|now|right now/,
            /20(2[4-9]|[3-9]\d)/,             // years 2024+
            /news|update|announce|release/,
            /price|stock|weather|score|result/,
            /who is|who are|ceo|president|leader/,
            /how much|how many.*currently/,
            /trending|popular right now/,
        ];

        for (const p of livePatterns) {
            if (p.test(q)) return true;
        }

        // If the query is a factual question (what/who/when/where), default to web for freshness
        if (/^(what|who|when|where|which)\s/i.test(q)) return true;

        return false;
    }

    // ─── Mission Execution (browser automation) ───
    // STRICT ROUTING:
    //   SEARCH / NAVIGATE → tool only, short status message, NO AI
    //   THINK             → AI only, no browsing
    //   ANALYZE           → tool + AI (crawl → phi3)

    async executeMission(prompt, webContents) {
        try {
            const intent = this._classifyMissionIntent(prompt);
            console.log('[Orchestrator] Intent:', intent.type, '| Query:', intent.query);

            switch (intent.type) {

                // ── SEARCH: open search page, NO AI ──
                case 'SEARCH': {
                    this._progress(`Searching: "${intent.query}"…`);
                    const searchUrl = searchService.generateSearchUrl(intent.query);
                    await webContents.loadURL(searchUrl);
                    await this._waitForLoad(webContents);
                    const msg = `Search page opened for "${intent.query}"`;
                    this._progress(msg, 'done');
                    return { success: true, summary: msg, url: webContents.getURL(), title: webContents.getTitle() };
                }

                // ── NAVIGATE: open URL directly, NO AI ──
                case 'NAVIGATE': {
                    this._progress(`Opening ${intent.url}…`);
                    await webContents.loadURL(intent.url);
                    await this._waitForLoad(webContents);
                    const title = webContents.getTitle() || intent.url;
                    const msg = `Opened **${title}**`;
                    this._progress(msg, 'done');
                    return { success: true, summary: msg, url: webContents.getURL(), title };
                }

                // ── SEARCH + OPEN FIRST: search → click first link, NO AI ──
                case 'SEARCH_AND_OPEN': {
                    this._progress(`Searching: "${intent.query}"…`);
                    const searchUrl = searchService.generateSearchUrl(intent.query);
                    await webContents.loadURL(searchUrl);
                    await this._waitForLoad(webContents);

                    this._progress('Finding first result…');
                    const links = await this._extractSearchResultLinks(webContents);
                    if (links.length > 0) {
                        this._progress(`Opening: ${links[0].text || links[0].href}…`);
                        await webContents.loadURL(links[0].href);
                        await this._waitForLoad(webContents);
                        const title = webContents.getTitle();
                        const msg = `Opened **${title}**`;
                        this._progress(msg, 'done');
                        return { success: true, summary: msg, url: webContents.getURL(), title };
                    }
                    const msg = `Search page opened for "${intent.query}" (no results to click)`;
                    this._progress(msg, 'done');
                    return { success: true, summary: msg, url: webContents.getURL(), title: webContents.getTitle() };
                }

                // ── SEARCH + OPEN + SUMMARIZE: full RAG pipeline ──
                case 'SEARCH_OPEN_SUMMARIZE': {
                    this._progress(`Searching: "${intent.query}"…`);
                    const sUrl = searchService.generateSearchUrl(intent.query);
                    await webContents.loadURL(sUrl);
                    await this._waitForLoad(webContents);

                    const sLinks = await this._extractSearchResultLinks(webContents);
                    if (sLinks.length > 0) {
                        this._progress(`Opening: ${sLinks[0].text || sLinks[0].href}…`);
                        await webContents.loadURL(sLinks[0].href);
                        await this._waitForLoad(webContents);
                    }

                    // Now crawl + summarize with AI
                    return await this._crawlAndSummarize(prompt, webContents);
                }

                // ── SUMMARIZE_PAGE: crawl current page + AI ──
                case 'SUMMARIZE_PAGE': {
                    return await this._crawlAndSummarize(prompt, webContents);
                }

                // ── ANALYZE: search + crawl + AI (RAG) ──
                case 'ANALYZE': {
                    this._progress(`Researching: "${intent.query}"…`);
                    const aUrl = searchService.generateSearchUrl(intent.query);
                    await webContents.loadURL(aUrl);
                    await this._waitForLoad(webContents);

                    const aLinks = await this._extractSearchResultLinks(webContents);
                    if (aLinks.length > 0) {
                        this._progress(`Reading: ${aLinks[0].text || aLinks[0].href}…`);
                        await webContents.loadURL(aLinks[0].href);
                        await this._waitForLoad(webContents);
                    }

                    return await this._crawlAndSummarize(prompt, webContents);
                }

                // ── THINK: AI only, no browsing ──
                case 'THINK': {
                    this._progress('Thinking…');
                    const promptType = this._detectPromptType(intent.query);
                    const formatted = this._buildPrompt(promptType, '', intent.query);
                    const aiResult = await aiService.runAgentTask(promptType.toLowerCase(), formatted);
                    if (aiResult.success) {
                        this._progress(aiResult.answer, 'done');
                        return { success: true, summary: aiResult.answer };
                    }
                    this._progress('AI failed: ' + (aiResult.error || 'unknown'), 'done');
                    return { success: false, error: aiResult.error };
                }

                default: {
                    // Fallback: treat as search
                    this._progress(`Searching: "${intent.query}"…`);
                    const fallbackUrl = searchService.generateSearchUrl(intent.query);
                    await webContents.loadURL(fallbackUrl);
                    await this._waitForLoad(webContents);
                    const msg = `Search page opened for "${intent.query}"`;
                    this._progress(msg, 'done');
                    return { success: true, summary: msg, url: webContents.getURL(), title: webContents.getTitle() };
                }
            }
        } catch (error) {
            console.error('[Orchestrator] executeMission error:', error);
            this._progress(`Error: ${error.message}`, 'done');
            return { success: false, error: error.message };
        }
    }

    /** Shared helper: extract page content → summarize with AI (used by ANALYZE/SUMMARIZE) */
    async _crawlAndSummarize(prompt, webContents) {
        this._progress('Extracting page content…');
        const pageData = await crawlerService.extractPageData(webContents);

        if (!pageData.success) {
            const msg = `Opened **${webContents.getTitle()}** but could not extract content.`;
            this._progress(msg, 'done');
            return { success: true, summary: msg, url: webContents.getURL(), title: webContents.getTitle() };
        }

        this._progress('Summarizing with AI…');
        const contentSnippet = (pageData.content || '').slice(0, 8000);
        const promptType = this._detectPromptType(prompt);
        const fullPrompt = this._buildPrompt(promptType,
            `Title: ${pageData.title}\nURL: ${pageData.url}\n\n${contentSnippet}`,
            prompt
        );

        const aiResult = await aiService.runAgentTask(promptType.toLowerCase(), fullPrompt);
        if (aiResult.success) {
            this._progress(aiResult.answer, 'done');
            return { success: true, summary: aiResult.answer, url: webContents.getURL(), title: webContents.getTitle() };
        }

        const fallback = `Opened **${pageData.title}** (${pageData.url}). Content extracted but AI summarization failed.`;
        this._progress(fallback, 'done');
        return { success: true, summary: fallback, url: webContents.getURL(), title: webContents.getTitle() };
    }

    // ─── Helpers ───

    /** Wait for the page to finish loading (with timeout) */
    _waitForLoad(webContents, timeoutMs = 15000) {
        return new Promise((resolve) => {
            if (!webContents.isLoading()) {
                return resolve();
            }
            const timer = setTimeout(() => {
                webContents.removeAllListeners('did-stop-loading');
                resolve();
            }, timeoutMs);

            webContents.once('did-stop-loading', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    /** Extract search result links from a Google/Bing/DuckDuckGo results page */
    async _extractSearchResultLinks(webContents) {
        try {
            await automationService.checkSession(webContents);
            const { result } = await automationService.sendCommand(webContents, 'Runtime.evaluate', {
                expression: `(function() {
                    try {
                        // Google
                        var googleLinks = Array.from(document.querySelectorAll('div.g a[href^="http"], div.MjjYud a[href^="http"], div[data-ved] a[href^="http"]'));
                        if (googleLinks.length) {
                            return JSON.stringify(googleLinks.slice(0, 10).map(function(a) {
                                return { text: (a.querySelector('h3') || a).textContent.trim(), href: a.href };
                            }).filter(function(l) { return l.href && !l.href.includes('google.com') && l.text; }));
                        }
                        // Generic: any result-like links
                        var allLinks = Array.from(document.querySelectorAll('a[href^="http"]'));
                        return JSON.stringify(allLinks.slice(0, 20).map(function(a) {
                            return { text: a.textContent.trim().substring(0, 120), href: a.href };
                        }).filter(function(l) { return l.text && l.text.length > 2; }).slice(0, 10));
                    } catch(e) { return '[]'; }
                })()`,
                returnByValue: true,
            });
            const links = JSON.parse(result?.value || '[]');
            return links;
        } catch (err) {
            console.warn('[Orchestrator] Failed to extract search links:', err.message);
            return [];
        }
    }

    // ─── Intent Analysis (for chat routing) ───

    analyzeIntent(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('image') || lowerMessage.includes('picture') || 
            lowerMessage.includes('screenshot') || lowerMessage.includes('photo')) {
            return 'vision';
        }
        
        if (lowerMessage.includes('remember') || lowerMessage.includes('recall')) {
            return 'memory';
        }
        
        return 'reasoning';
    }

    async processMessage(sessionId, messages, options = {}) {
        const lastMessage = messages[messages.length - 1];
        const intent = this.analyzeIntent(lastMessage.content);

        try {
            let response;
            let context = [];

            switch (intent) {
                case 'vision':
                    if (options.images && options.images.length > 0) {
                        response = await aiService.chatWithVision(messages, options.images);
                    } else {
                        response = await aiService.chatWithPhi3([
                            ...messages,
                            { role: 'assistant', content: 'I need an image to analyze. Please provide an image.' }
                        ]);
                    }
                    break;

                case 'memory':
                    context = await memoryService.searchMemory(sessionId, lastMessage.content, 3);
                    const contextText = context.map(m => m.text).join('\n');
                    const enrichedMessages = [
                        { role: 'system', content: `Context from previous conversations:\n${contextText}` },
                        ...messages
                    ];
                    response = await aiService.chatWithPhi3(enrichedMessages);
                    break;

                case 'reasoning':
                default: {
                    // Use structured prompt template even for direct chat
                    const promptType = this._detectPromptType(lastMessage.content);
                    const formattedPrompt = this._buildPrompt(promptType, '', lastMessage.content);
                    response = await aiService.chatWithPhi3([
                        { role: 'system', content: 'Always respond using Markdown formatting with headings, bullet points, and bold text.' },
                        ...messages.slice(0, -1),
                        { role: 'user', content: formattedPrompt }
                    ]);
                    break;
                }
            }

            await memoryService.storeMemory(sessionId, lastMessage.content, {
                intent,
                timestamp: Date.now(),
            });
            await memoryService.storeMemory(sessionId, response, {
                role: 'assistant',
                timestamp: Date.now(),
            });

            return {
                success: true,
                response,
                intent,
                context: context.map(c => ({ text: c.text, score: c.score })),
            };
        } catch (error) {
            console.error('Orchestrator error:', error);
            return {
                success: false,
                error: error.message,
                intent,
            };
        }
    }

    clearSessionContext(sessionId) {
        this.sessionContexts.delete(sessionId);
        memoryService.clearMemory(sessionId);
    }

    getSessionContext(sessionId) {
        return this.sessionContexts.get(sessionId) || {};
    }

    // ─── AUTO Intent Classification ───
    // When no explicit mode is selected, detect intent from input text.
    // Rules are evaluated top-to-bottom; first match wins.
    // NO AI is called during classification — pure regex/string checks.

    /**
     * Classify user input into a mode when AUTO is selected.
     * @param {string} input - Raw user input
     * @returns {'SEARCH' | 'ACTION' | 'THINK' | 'REFINE'}
     */
    classifyIntent(input) {
        const text = (input || '').trim();
        const lower = text.toLowerCase();

        // 1. Greetings → THINK  ("hi", "hello", "hey", "good morning", etc.)
        if (/^(hi|hello|hey|howdy|good\s*(morning|evening|afternoon|night)|sup|yo|hola)\b/i.test(lower)) {
            return 'THINK';
        }

        // 2. Direct URL → ACTION  (starts with http/https)
        if (/^https?:\/\//i.test(text)) {
            return 'ACTION';
        }

        // 3. Domain-like input → ACTION  ("youtube.com", "github.io", etc.)
        if (/^[\w-]+\.(com|org|net|io|dev|ai|co|app|edu|gov|me|info)$/i.test(lower)) {
            return 'ACTION';
        }

        // 4. Explicit open/go/visit/navigate commands → ACTION
        if (/^(open|go\s*to|visit|navigate\s*to|launch)\s+/i.test(lower)) {
            return 'ACTION';
        }

        // 5. Knowledge / reasoning questions → THINK
        if (/^(what|how|why|explain|define|describe|tell\s*me|who|when|where|which|can\s*you|could\s*you|is\s+there|are\s+there)\b/i.test(lower)) {
            return 'THINK';
        }

        // 6. Thinking keywords anywhere → THINK
        if (/\b(explain|define|meaning|difference|compare|pros\s*and\s*cons|summarize|think|reason|analyze)\b/i.test(lower)) {
            return 'THINK';
        }

        // 7. Default → SEARCH  (everything else: "github", "latest AI news", etc.)
        return 'SEARCH';
    }

    // ─── Mode-Controlled Command Router ───
    // UI sends { mode, input } — mode determines exact routing.
    // AUTO    → classifyIntent decides
    // SEARCH  → tool only (no AI)
    // ACTION  → automation only (no AI)
    // THINK   → AI only (no browsing)
    // REFINE  → AI + memory context (no browsing)

    /**
     * Route a command based on the UI mode (or AUTO-detect).
     * @param {{ mode: string, input: string }} request
     * @param {{ webContents?: Electron.WebContents, sessionId?: string, getWebContents?: Function }} context
     * @returns {Promise<{ type: string, message: string, url?: string, title?: string, resolvedMode?: string }>}
     */
    async handleCommand(request, context = {}) {
        let { mode, input } = request;
        const { sessionId } = context;

        // ── AUTO: resolve mode from input text ──
        if (!mode || mode === 'AUTO') {
            mode = this.classifyIntent(input);
            console.log(`[Orchestrator] AUTO → resolved to ${mode}  input="${input}"`);
        } else {
            console.log(`[Orchestrator] handleCommand  mode=${mode}  input="${input}"`);
        }

        // For browser modes, ensure we have webContents (lazy-acquire via callback)
        let { webContents } = context;
        if ((mode === 'SEARCH' || mode === 'ACTION') && !webContents && context.getWebContents) {
            const acquired = await context.getWebContents();
            webContents = acquired.webContents;
            context._acquiredTabId = acquired.tabId;
        }

        switch (mode) {

            // ── SEARCH: open search page, NO AI ──
            case 'SEARCH': {
                if (!webContents) {
                    return { type: 'ERROR', message: 'No browser tab available for search.' };
                }

                // Check for direct URL / domain first
                const analysis = searchService.analyzeQuery(input);
                if (analysis.isDirect) {
                    this._progress(`Opening ${analysis.queries[0].url}…`);
                    await webContents.loadURL(analysis.queries[0].url);
                    await this._waitForLoad(webContents);
                    const title = webContents.getTitle() || input;
                    this._progress(`Opened **${title}**`, 'done');
                    return {
                        type: 'STATUS',
                        message: `Opened **${title}**`,
                        url: webContents.getURL(),
                        title,
                    };
                }

                // Regular search
                this._progress(`Searching: "${input}"…`);
                const searchUrl = searchService.generateSearchUrl(input);
                await webContents.loadURL(searchUrl);
                await this._waitForLoad(webContents);
                const msg = `Search page opened for "${input}"`;
                this._progress(msg, 'done');
                return {
                    type: 'STATUS',
                    message: msg,
                    url: webContents.getURL(),
                    title: webContents.getTitle(),
                };
            }

            // ── ACTION: automation / navigation, NO AI ──
            case 'ACTION': {
                if (!webContents) {
                    return { type: 'ERROR', message: 'No browser tab available for action.' };
                }

                // Delegate to executeMission which already handles navigate/open/click etc.
                this._progress(`Executing action: "${input}"…`);
                const result = await this.executeMission(input, webContents);
                this._progress(result.summary || 'Action completed.', 'done');
                return {
                    type: 'STATUS',
                    message: result.summary || `Action executed: ${input}`,
                    url: result.url,
                    title: result.title,
                };
            }

            // ── THINK: AI reasoning only, NO browsing ──
            case 'THINK': {
                this._progress('Thinking…');
                const promptType = this._detectPromptType(input);
                const formatted = this._buildPrompt(promptType, '', input);
                const aiResult = await aiService.runAgentTask(promptType.toLowerCase(), formatted);

                if (aiResult.success) {
                    this._progress('Done.', 'done');
                    return {
                        type: 'AI_RESPONSE',
                        message: aiResult.answer,
                    };
                }
                return {
                    type: 'ERROR',
                    message: aiResult.error || 'AI reasoning failed.',
                };
            }

            // ── REFINE: AI + previous memory context ──
            case 'REFINE': {
                return await this.handleRefine(input, context);
            }

            default:
                return { type: 'ERROR', message: `Unknown mode: ${mode}` };
        }
    }

    /**
     * Convenience: resolve AUTO mode without executing.
     * Used by IPC layer to know if webContents is needed before calling handleCommand.
     */
    resolveMode(mode, input) {
        if (!mode || mode === 'AUTO') return this.classifyIntent(input);
        return mode;
    }

    /**
     * Refine mode — uses memory context + AI to refine/expand on previous work.
     * @param {string} input
     * @param {{ sessionId?: string }} context
     */
    async handleRefine(input, context = {}) {
        this._progress('Refining with context…');

        let memoryContext = '';
        const sessionId = context.sessionId;

        // Step 1: Try semantic memory search
        try {
            if (sessionId) {
                const memories = await memoryService.searchMemory(sessionId, input, 3);
                if (memories && memories.length > 0) {
                    memoryContext = memories.map(m => m.text).join('\n---\n');
                }
            }
        } catch (err) {
            console.warn('[Orchestrator] Semantic memory search failed:', err.message);
        }

        // Step 2: Fallback to file-based recent interactions
        if (!memoryContext) {
            try {
                const recent = memoryService.getRecentInteractions(3);
                if (recent && recent.length > 0) {
                    memoryContext = recent.map(i =>
                        `${i.prompt || ''} → ${(i.response || '').slice(0, 200)}`
                    ).join('\n');
                }
            } catch (err) {
                console.warn('[Orchestrator] File memory fallback failed:', err.message);
            }
        }

        // Step 3: Build a lean prompt (no context = just answer the question directly)
        let prompt;
        if (memoryContext) {
            prompt = `Context:\n${memoryContext}\n\nQuestion: ${input}\n\nAnswer in Markdown:`;
        } else {
            // No memory context available — just answer the question directly
            // This avoids bloated prompts when there's nothing to refine against
            this._progress('No prior context found, answering directly…');
            prompt = `${input}\n\nRespond in Markdown:`;
        }

        const aiResult = await aiService.runAgentTask('refine', prompt);

        if (aiResult.success) {
            this._progress('Done.', 'done');
            return {
                type: 'AI_RESPONSE',
                message: aiResult.answer,
            };
        }
        return {
            type: 'ERROR',
            message: aiResult.error || 'Refine failed.',
        };
    }
}

export default Orchestrator;
