/**
 * PlannerService
 * Uses Gemini ONCE to generate a structured, ordered list of tool steps.
 * AgentLoop executes these steps directly — no further LLM calls per step.
 */
export default class PlannerService {
    constructor(llmManager) {
        this.llmManager = llmManager;
    }

    /**
     * Returns an ordered array of steps:
     * [{ tool: 'web_search', args: { query: '...' } }, ...]
     */
    async generatePlan(userRequest) {
        console.log('[PlannerService] Generating structured execution plan...');

        const planPrompt = `
You are a high-level Browser Intent Planner (Layer 1).
Your only job is to translate a user request into a strict, deterministic sequence of human UI actions.

User Request: "${userRequest}"

Output a JSON array of actions using ONLY these tools:
- navigate(url)
- type_text(fields: { "label/description": "value" })
- click_text(text: "label")
- press_key(key: "Enter")
- scroll(direction: "down"|"up", amount: 500)
- wait_for_results(ms: 3000)
- extract_content()
- summarize()

STRICT EXECUTION RULES:
1. Behavioral Pacing: Always include wait_for_results after any action that causes a page load (navigation or search).
2. Domain Logic: If the request is for a specific site (e.g., Flipkart, Amazon), start with navigate.
3. Goal Orientation: STOP immediately once the user's specific goal is achieved.
4. Human Feel: Use type_text followed by press_key("Enter") instead of searching via URL.
5. Platform Navigation: If a search query results in a list (e.g. Yahoo Finance, Amazon), ALWAYS include a click_text step for the most relevant result (e.g. clicking the ticker "NVDA" or the product name) before extracting content.
6. Determinism: AI must NOT re-decide anything. Plan the entire sequence NOW.

JSON Structure:
[
  { "tool": "navigate", "args": { "url": "..." }, "description": "🌐 Opening website..." },
  { "tool": "type_text", "args": { "fields": { "search": "keyword" } }, "description": "⌨️ Typing..." },
  { "tool": "press_key", "args": { "key": "Enter" }, "description": "⌨️ Pressing Enter..." },
  { "tool": "wait_for_results", "args": { "ms": 5000 }, "description": "⏳ Waiting for page to load..." },
  { "tool": "click_text", "args": { "text": "Brand Name" }, "description": "🖱️ Clicking filter..." },
  { "tool": "extract_content", "args": {}, "description": "🔍 Reading page content..." }
]
`.trim();

        try {
            const response = await this.llmManager.chatText(planPrompt);

            // Parse the JSON step list from the response
            const steps = this._parseSteps(response);

            if (steps.length === 0) {
                console.warn('[PlannerService] No steps parsed, using fallback plan.');
                return this._fallbackPlan(userRequest);
            }

            console.log(`[PlannerService] Plan ready: ${steps.length} steps.`);
            steps.forEach((s, i) => console.log(`  Step ${i + 1}: ${s.tool} — ${s.description}`));

            return steps;

        } catch (error) {
            console.error('[PlannerService] Plan generation failed:', error.message);
            return this._fallbackPlan(userRequest);
        }
    }

    /**
     * Parses the JSON step array from the LLM response text.
     */
    _parseSteps(responseText) {
        try {
            // Strip any accidental markdown fences
            const cleaned = responseText
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();

            const parsed = JSON.parse(cleaned);

            if (!Array.isArray(parsed)) {
                console.warn('[PlannerService] Response was not an array.');
                return [];
            }

            // Validate each step
            return parsed.filter(step =>
                step && typeof step.tool === 'string' && typeof step.args === 'object'
            );
        } catch (e) {
            console.error('[PlannerService] JSON parse error:', e.message);
            return [];
        }
    }

    /**
     * Minimal fallback plan if Gemini can't produce a proper plan.
     */
    _fallbackPlan(userRequest) {
        return [
            {
                tool: 'navigate',
                args: { url: `https://www.google.com/search?q=${encodeURIComponent(userRequest)}` },
                description: `Search for: ${userRequest}`
            }
        ];
    }
}
