import * as CreditGuard from './CreditGuard.js';

/**
 * IntentClassifier
 *
 * Determines whether a user's input is:
 * - chat:       Conversational question the LLM can answer directly
 * - navigate:   Direct site navigation command (e.g. "go to google")
 * - task:       Multi-step browser automation needing workflow planning (DAG)
 * - autonomous: Complex, exploratory, multi-site research or open-ended
 *               browsing that benefits from the Fellou-style feedback loop
 *
 * For "chat" intents, the response includes the answer text so no second LLM call is needed.
 * For "navigate" intents, the response includes the resolved URL.
 * For "autonomous" intents, the loop takes over — no DAG plan is generated.
 */

const CLASSIFY_PROMPT = `
You are an intent classifier for a browser automation assistant called VeriBrowse.
Given a user message, classify it into ONE of four intents and respond with JSON.

Intents:
1. "chat" — Greetings, knowledge questions, explanations, opinions, small talk, or anything you can answer from your own knowledge without browsing the web. Examples: "hi", "what is electron?", "explain React hooks", "thanks", "who invented JavaScript?", "how does CSS grid work?"
2. "navigate" — The user wants to go to a specific website. They mention a site name or URL directly. Examples: "go to google", "open youtube", "visit amazon.com", "take me to github.com", "open reddit"
3. "task" — A deterministic, few-step task with a clear action plan: fill a form, click a button, extract text from a known page. Examples: "click the login button on this page", "fill out the contact form on example.com", "extract the price from amazon.com/dp/B09V3KXJPB"
4. "autonomous" — An open-ended multi-step task that requires exploring multiple pages, comparing data, searching, or reasoning about what to do next. Examples: "find the cheapest laptop on amazon under $500", "search for latest AI news and summarize the top 3 stories", "compare iPhone 15 vs Samsung S24 specs and price", "book a flight to New York", "research the best restaurants near me"

Rules:
- If the user asks a factual question you can answer from training data, classify as "chat".
- If the user explicitly says "search for X", "find the best X", "compare X vs Y", or any multi-step research task, classify as "autonomous".
- If the user says "go to X" or "open X" where X is a recognizable website, classify as "navigate".
- If the task is simple and can be described as a short linear set of clicks/types, classify as "task".
- If in doubt between "task" and "autonomous", prefer "autonomous" — the feedback loop handles both.
- For "chat" intent, include a helpful response in the "response" field.
- For "navigate" intent, include the full URL in the "url" field (always include https://).
- For "task" and "autonomous" intents, leave both "response" and "url" as null.

Return ONLY valid JSON with this exact shape:
{
  "intent": "chat" | "navigate" | "task" | "autonomous",
  "response": "string or null",
  "url": "string or null"
}
`.trim();

/**
 * Classify user input into chat / navigate / task / autonomous.
 * Returns { intent, response, url }
 */
export async function classify(userInput) {
    const prompt = `${CLASSIFY_PROMPT}\n\nUser message: "${userInput}"`;

    try {
        const result = await CreditGuard.generateJSON(prompt);

        // Validate shape
        const intent = result?.intent;
        if (!['chat', 'navigate', 'task', 'autonomous'].includes(intent)) {
            console.warn('[IntentClassifier] Invalid intent from LLM:', intent, '— defaulting to autonomous');
            return { intent: 'autonomous', response: null, url: null };
        }

        return {
            intent,
            response: result.response || null,
            url: result.url || null,
        };
    } catch (err) {
        console.error('[IntentClassifier] Classification failed:', err.message);
        // On failure, fall through to autonomous (safest default — the loop handles everything)
        return { intent: 'autonomous', response: null, url: null };
    }
}
