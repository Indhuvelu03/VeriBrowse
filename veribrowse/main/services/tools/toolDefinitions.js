/**
 * Tool Definitions for VeriBrowse
 */
export const tools = [
    {
        name: 'web_search',
        description: 'Search the web using Tavily API. Use this to find websites or answers for the user.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                num_results: { type: 'number', description: 'Number of results', default: 5 }
            },
            required: ['query']
        }
    },
    {
        name: 'open_page',
        description: 'Navigate to a specific URL in the browser.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The absolute URL' }
            },
            required: ['url']
        }
    },
    {
        name: 'extract_content',
        description: 'Extract clean readable text from the current page. Removes nav, footer, ads.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'web_click',
        description: 'Click an element (button, link, checkbox) on the current page.',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The visible text or description of the element' },
                selector: { type: 'string', description: 'Optional CSS selector' }
            },
            required: ['text']
        }
    },
    {
        name: 'web_fill_form',
        description: 'Type text into input fields.',
        parameters: {
            type: 'object',
            properties: {
                fields: { type: 'object', description: 'Key-value pairs of selector/description to value' },
                submit: { type: 'boolean', default: false }
            },
            required: ['fields']
        }
    },
    {
        name: 'web_scroll',
        description: 'Scroll the page to see more content or filters.',
        parameters: {
            type: 'object',
            properties: {
                direction: { type: 'string', enum: ['up', 'down'], default: 'down' },
                amount: { type: 'number', default: 500 }
            },
            required: []
        }
    },
    {
        name: 'web_enter',
        description: 'Press the Enter key. Use this to submit a search after typing.',
        parameters: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'wait_for_load',
        description: 'Wait for a few seconds for results to appear.',
        parameters: {
            type: 'object',
            properties: {
                milliseconds: { type: 'number', default: 2000 }
            }
        }
    }
];
