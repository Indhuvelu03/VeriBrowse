/**
 * AgentLoop (Deterministic Executor - LAYER 3)
 *
 * This component is strictly deterministic:
 * 1. It receives a pre-built plan from the Planner.
 * 2. It executes each action exactly.
 * 3. It emits live progress events for the UI timeline.
 * 4. It does NOT make AI calls during execution.
 */
export default class AgentLoop {
    constructor(llmManager, orchestrator) {
        this.llmManager = llmManager;
        this.orchestrator = orchestrator;
        this.isBusy = false;
    }

    /**
     * @param {string} userMessage      - Original user prompt
     * @param {Array}  steps            - Planned steps from Layer 2
     * @param {string} mode             - Agent mode
     * @param {Function} progressCallback - UI event emitter
     */
    async run(userMessage, steps = [], mode = 'auto', progressCallback = null) {
        if (this.isBusy) return { success: false, error: 'Agent is already busy.' };
        this.isBusy = true;

        const history = [];
        console.log(`[AgentLoop] Starting deterministic execution for: "${userMessage}"`);

        try {
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const stepNum = i + 1;

                // 1. Emit Live Timeline Event
                if (progressCallback) {
                    progressCallback({
                        status: 'executing',
                        type: step.tool, // e.g. 'navigate', 'click'
                        message: step.description,
                        current: stepNum,
                        total: steps.length
                    });
                }

                // 2. Human Pacing (Randomized Delay 500-800ms)
                const delay = 500 + Math.random() * 300;
                await new Promise(r => setTimeout(r, delay));

                console.log(`[AgentLoop] Step ${stepNum}/${steps.length}: ${step.tool}`, step.args);

                // 3. Absolute Mapping to Orchestrator commands
                const toolName = this._mapTool(step.tool);

                // 4. Execute
                const result = await this.orchestrator.executeTool(toolName, step.args);

                history.push({
                    tool: step.tool,
                    args: step.args,
                    description: step.description,
                    success: result.success,
                    result
                });

                if (!result.success) {
                    console.error(`[AgentLoop] Step ${stepNum} (${step.tool}) failed:`, result.error);
                    // We continue in deterministic mode unless it's a critical fatal error
                }
            }

            // 5. Mission Complete - Generate Summary
            if (progressCallback) {
                progressCallback({ status: 'thinking', message: 'Summarizing results...' });
            }

            const summary = await this._summarize(userMessage, history);

            this.isBusy = false;
            return {
                success: true,
                response: summary,
                actions: history
            };

        } catch (error) {
            console.error('[AgentLoop] Fatal error during execution:', error);
            this.isBusy = false;
            return { success: false, error: error.message };
        }
    }

    _mapTool(plannerTool) {
        const mapping = {
            'navigate': 'web_navigate',
            'type_text': 'web_fill_form',
            'click_text': 'web_click',
            'press_key': 'web_enter',
            'wait_for_results': 'wait_for_load',
            'scroll': 'web_scroll',
            'extract_content': 'web_extract',
            'summarize': 'web_extract' // Extract content for summary
        };
        return mapping[plannerTool] || plannerTool;
    }

    async _summarize(prompt, history) {
        // 1. Check if we have extracted content in the history
        const extraction = history.find(h => h.tool === 'summarize' || h.tool === 'extract_content');
        const pageText = extraction?.result?.textContent || "";

        const summaryPrompt = `
        The user asked: "${prompt}"
        
        The browser agent performed these actions:
        ${history.map(h => `- ${h.description} [${h.success ? 'OK' : 'FAIL'}]`).join('\n')}
        
        Page Content Fragment:
        "${pageText.substring(0, 6000)}"

        TASK: Based EQUALLY on the actions taken and the extracted page content, provide a concise 2-3 sentence answer to the user's request.
        If the user asked for a summary, provide the summary data itself, not just "I summarized it".
        `.trim();

        try {
            return await this.llmManager.chatText(summaryPrompt);
        } catch (e) {
            return "Mission complete. I have performed the requested UI actions.";
        }
    }
}
