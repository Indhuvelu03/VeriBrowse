/**
 * SearchService (API based)
 * Uses Tavily API for fast and unblocked structured search results.
 */
export default class SearchService {
    constructor(browserService) {
        this.browserService = browserService;
        // API Keys should ideally be in process.env or settings
        this.tavilyKey = process.env.TAVILY_API_KEY;
    }

    /**
     * Executes a search query using Tavily API
     * Returns structured results: [{title, url, snippet}]
     */
    async search(query, numResults = 5) {
        try {
            console.log(`[SearchService] Searching: "${query}" via Tavily...`);

            if (!this.tavilyKey) {
                console.warn('[SearchService] TAVILY_API_KEY not found. Search might fail.');
                // Fallback to a placeholder or error if user insists on REMOVING scraping
                return {
                    success: false,
                    error: 'Tavily API key missing. Please configure TAVILY_API_KEY.'
                };
            }

            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.tavilyKey,
                    query: query,
                    search_depth: "basic",
                    max_results: numResults,
                    include_answer: false,
                    include_images: false,
                    include_raw_content: false
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Tavily API error: ${errorData.detail || response.statusText}`);
            }

            const data = await response.json();

            // Format results to standard VeriBrowse structure
            const results = data.results.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.content || r.snippet
            }));

            console.log(`[SearchService] Found ${results.length} results via API.`);

            return {
                success: true,
                query: query,
                results: results
            };

        } catch (error) {
            console.error('[SearchService] Search execution error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}
