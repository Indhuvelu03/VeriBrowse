/**
 * SearchService - Web Search Integration
 * 
 * Built with: Claude Sonnet 4.5
 * Date: February 7, 2026
 * 
 * Responsibilities:
 * - Perform real-time web searches
 * - Fetch and parse search results
 * - Generate search queries from natural language
 * - Support multiple search engines
 */

class SearchService {
    constructor() {
        this.searchEngines = {
            google: 'https://www.google.com/search?q=',
            duckduckgo: 'https://duckduckgo.com/?q=',
            bing: 'https://www.bing.com/search?q=',
        };
        this.defaultEngine = 'google';
    }

    /**
     * Generate search URL from query
     * @param {String} query - Search query
     * @param {String} engine - Search engine name
     * @returns {String} - Search URL
     */
    generateSearchUrl(query, engine = this.defaultEngine) {
        const baseUrl = this.searchEngines[engine] || this.searchEngines[this.defaultEngine];
        return `${baseUrl}${encodeURIComponent(query)}`;
    }

    /**
     * Analyze query and determine search type
     * @param {String} prompt - User input
     * @returns {Object} - { type, count, queries }
     */
    analyzeQuery(prompt) {
        const text = (prompt || '').trim().toLowerCase();

        // URL pattern - direct navigation
        if (/^https?:\/\//i.test(text)) {
            return { type: 'url', count: 1, isDirect: true, queries: [{ url: text, query: text }] };
        }

        // Domain pattern - direct navigation
        if (/^[\w-]+\.(com|ai|io|org|net|dev|co|app)$/i.test(text)) {
            const url = `https://${text}`;
            return { type: 'domain', count: 1, isDirect: true, queries: [{ url, query: text }] };
        }

        // Simple patterns
        const simplePatterns = [
            /^what is [\w\s]+$/i,
            /^who is [\w\s]+$/i,
            /^define [\w\s]+$/i,
            /^[\w\s]{1,20}$/i,
        ];

        for (const pattern of simplePatterns) {
            if (pattern.test(text)) {
                return { 
                    type: 'simple', 
                    count: 1, 
                    isDirect: false,
                    queries: [{ query: text, url: this.generateSearchUrl(text) }]
                };
            }
        }

        // Research patterns - needs multiple searches
        const researchPatterns = [
            /how to (make|build|create|develop)/i,
            /compare|vs|versus|difference/i,
            /best (way|practice|tool|method)/i,
            /research|explore|analyze|investigate/i,
            /summary of|summarize|overview of/i,
        ];

        for (const pattern of researchPatterns) {
            if (pattern.test(text)) {
                const queries = this.generateResearchQueries(text);
                return { type: 'research', count: queries.length, isDirect: false, queries };
            }
        }

        // Default based on word count
        const wordCount = text.split(/\s+/).length;
        if (wordCount <= 3) {
            return { 
                type: 'simple', 
                count: 1, 
                isDirect: false,
                queries: [{ query: text, url: this.generateSearchUrl(text) }]
            };
        }

        if (wordCount <= 6) {
            const queries = [
                { query: text, url: this.generateSearchUrl(text) },
                { query: `${text} examples`, url: this.generateSearchUrl(`${text} examples`) }
            ];
            return { type: 'moderate', count: 2, isDirect: false, queries };
        }

        // Complex research query
        const queries = this.generateResearchQueries(text);
        return { type: 'research', count: queries.length, isDirect: false, queries };
    }

    /**
     * Generate multiple research queries from complex prompt
     * @param {String} prompt - Complex research prompt
     * @returns {Array} - Array of query objects
     */
    generateResearchQueries(prompt) {
        const text = prompt.trim();
        const queries = [{ query: text, url: this.generateSearchUrl(text) }];

        // Add context-specific queries
        if (/browser|app|application/i.test(text)) {
            queries.push(
                { query: `${text} architecture`, url: this.generateSearchUrl(`${text} architecture`) },
                { query: `${text} tools libraries`, url: this.generateSearchUrl(`${text} tools libraries`) },
                { query: `${text} tutorial`, url: this.generateSearchUrl(`${text} tutorial`) }
            );
        } else if (/how to/i.test(text)) {
            queries.push(
                { query: `${text} step by step`, url: this.generateSearchUrl(`${text} step by step`) },
                { query: `${text} best practices`, url: this.generateSearchUrl(`${text} best practices`) },
                { query: `${text} examples`, url: this.generateSearchUrl(`${text} examples`) }
            );
        } else {
            queries.push(
                { query: `${text} guide`, url: this.generateSearchUrl(`${text} guide`) },
                { query: `${text} tools`, url: this.generateSearchUrl(`${text} tools`) },
                { query: `${text} examples`, url: this.generateSearchUrl(`${text} examples`) }
            );
        }

        // Limit to 4 queries
        return queries.slice(0, 4);
    }

    /**
     * Build smart queries with context awareness
     * @param {String} prompt - User input
     * @param {Object} options - Search options
     * @returns {Array} - Array of search query objects
     */
    buildSmartQueries(prompt, options = {}) {
        const analysis = this.analyzeQuery(prompt);
        
        // Apply any filters or modifications based on options
        if (options.limit) {
            analysis.queries = analysis.queries.slice(0, options.limit);
        }

        if (options.engine) {
            analysis.queries = analysis.queries.map(q => ({
                ...q,
                url: this.generateSearchUrl(q.query, options.engine)
            }));
        }

        return analysis;
    }

    /**
     * Extract search intent from natural language
     * @param {String} prompt - User input
     * @returns {Object} - Intent classification
     */
    extractIntent(prompt) {
        const text = (prompt || '').trim().toLowerCase();

        if (/^(search|find|look|google)\s/i.test(text)) {
            return { intent: 'search', query: text.replace(/^(search|find|look|google)\s+/i, '') };
        }

        if (/^(open|go to|navigate to|visit)\s/i.test(text)) {
            return { intent: 'navigate', query: text.replace(/^(open|go to|navigate to|visit)\s+/i, '') };
        }

        if (/^(summarize|summary|tldr|what is)\s/i.test(text)) {
            return { intent: 'summarize', query: text };
        }

        if (/^(research|explore|investigate|analyze)\s/i.test(text)) {
            return { intent: 'research', query: text.replace(/^(research|explore|investigate|analyze)\s+/i, '') };
        }

        if (/^(how to|how do i|how can i)\s/i.test(text)) {
            return { intent: 'tutorial', query: text };
        }

        // Default - treat as search
        return { intent: 'search', query: text };
    }

    /**
     * Check if input is a URL
     * @param {String} text - Input text
     * @returns {Boolean}
     */
    isUrl(text) {
        try {
            new URL(text);
            return true;
        } catch {
            return /^[\w-]+\.(com|ai|io|org|net|dev|co|app)$/i.test(text);
        }
    }

    /**
     * Normalize URL (add protocol if missing)
     * @param {String} url - URL string
     * @returns {String} - Normalized URL
     */
    normalizeUrl(url) {
        if (/^https?:\/\//i.test(url)) {
            return url;
        }
        if (/^[\w-]+\./i.test(url)) {
            return `https://${url}`;
        }
        return url;
    }
}

export default new SearchService();
