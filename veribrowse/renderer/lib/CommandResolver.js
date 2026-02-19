/**
 * CommandResolver
 * 
 * A unified command parser for EVERYTHING (Search Bar, Chat, Agent).
 * Decides whether an input is a URL, a search query, a direct site command, or an agent mission.
 */

export const resolveCommand = (input) => {
    const text = input.trim();
    if (!text) return { type: 'empty', intent: 'none', value: '', original: '' };
    const lowerText = text.toLowerCase();

    // Rule 1: Complex Agentic Task (Priority)
    // If it's a long instruction or contains agent keywords, let the AI handle it.
    const agentKeywords = ['search', 'find', 'summarize', 'analyze', 'click', 'extract', 'check', 'browse', 'filter', 'buy', 'get'];
    const words = text.split(/\s+/);
    const hasAgentKeyword = agentKeywords.some(k => lowerText.includes(k));

    if (hasAgentKeyword || words.length >= 4) {
        return {
            type: 'agent-task',
            intent: 'agent',
            value: text,
            original: text
        };
    }

    // Rule 2: Direct Site Command (e.g., "open github", "go to youtube")
    const directSitePrefixes = ['open ', 'go to ', 'visit '];
    for (const prefix of directSitePrefixes) {
        if (lowerText.startsWith(prefix)) {
            const site = text.substring(prefix.length).trim();
            const siteWords = site.split(/\s+/);

            // If it's more than 2 words, it's likely a prompt, not a site name
            if (siteWords.length > 2) break;

            const url = site.includes('.') ? site : `${site}.com`;
            return {
                type: 'direct-site',
                intent: 'navigate',
                value: url.startsWith('http') ? url : `https://${url}`,
                original: text
            };
        }
    }

    // Rule 3: Real URL (e.g., "google.com", "https://openai.com")
    if (isDomainLike(lowerText) && !text.includes(' ')) {
        return {
            type: 'url',
            intent: 'navigate',
            value: lowerText.startsWith('http') ? lowerText : `https://${lowerText}`,
            original: text
        };
    }

    // Rule 4: Fallback to Google Search
    return {
        type: 'search',
        intent: 'navigate',
        value: `https://www.google.com/search?q=${encodeURIComponent(text)}`,
        original: text
    };
};

/**
 * Helper to check if a string looks like a domain/URL
 */
function isDomainLike(text) {
    // Already a full URL
    if (text.startsWith('http://') || text.startsWith('https://')) return true;

    // Localhost
    if (text.startsWith('localhost:')) return true;

    // Standard domain pattern (something.tld)
    const domainRegex = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
    return domainRegex.test(text);
}
