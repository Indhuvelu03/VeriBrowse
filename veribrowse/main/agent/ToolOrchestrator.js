import SearchService from '../services/SearchService.js';
import BrowserService from '../services/BrowserService.js';
import ExtractService from '../services/ExtractService.js';

/**
 * ToolOrchestrator
 * Executes tools requested by AI and routes them to the correct service.
 */
export default class ToolOrchestrator {
    constructor(browserService) {
        this.browserService = browserService || new BrowserService();
        this.searchService = new SearchService(this.browserService);
        this.extractService = new ExtractService();

        // Track active operations for debugging and status reporting
        this.activeOperations = new Map();
    }

    /**
     * Executes a single tool command
     */
    async executeTool(toolName, args, context = {}) {
        const operationId = Date.now().toString();
        console.log(`[ToolOrchestrator] Executing tool: ${toolName}`, args);

        try {
            let result;

            switch (toolName) {
                // UNIVERSAL HUMAN ACTIONS
                case 'navigate':
                case 'web_navigate':
                    result = await this.browserService.navigate(args.url);
                    break;

                case 'type_text':
                case 'web_fill_form':
                    result = await this.browserService.fillForm(args.fields || args.form_data);
                    break;

                case 'click_text':
                case 'web_click':
                    result = await this.browserService.clickElement(args.text || args.element_description);
                    break;

                case 'press_key':
                case 'web_enter':
                    result = await this.browserService.pressEnter();
                    break;

                case 'wait_for_results':
                case 'wait_for_load':
                case 'wait':
                    await this.browserService.wait(args.ms || args.milliseconds || 2000);
                    result = { success: true };
                    break;

                case 'extract_content':
                case 'summarize':
                case 'web_extract':
                    result = await this.browserService.extractCleanContent();
                    break;

                case 'scroll':
                case 'web_scroll':
                    result = await this.browserService.scroll(args.direction || 'down', args.amount || 500);
                    break;

                default:
                    result = { success: false, error: `Unknown tool: ${toolName}` };
            }

            return result;

        } catch (error) {
            console.error(`[ToolOrchestrator] Tool Error (${toolName}):`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Executes multiple tool calls sequentially with optional progress reporting
     */
    async executeMultipleTools(functionCalls, sendProgress = null) {
        console.log(`[ToolOrchestrator] Executing sequence of ${functionCalls.length} tools`);
        const results = [];

        for (let i = 0; i < functionCalls.length; i++) {
            const call = functionCalls[i];

            if (sendProgress) {
                sendProgress({
                    current: i + 1,
                    total: functionCalls.length,
                    tool: call.name,
                    status: 'executing'
                });
            }

            const result = await this.executeTool(call.name, call.args);

            results.push({
                tool: call.name,
                args: call.args,
                result: result,
                success: result.success
            });

            if (sendProgress) {
                sendProgress({
                    current: i + 1,
                    total: functionCalls.length,
                    tool: call.name,
                    status: result.success ? 'completed' : 'failed'
                });
            }
        }

        return results;
    }

    async cleanup() {
        console.log('[ToolOrchestrator] Cleaning up resources...');
        await this.browserService.close();
    }
}
