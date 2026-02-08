
export const LocalSelectors = {
    'google.com': {
        searchInput: 'textarea[name="q"]',
        firstResult: 'div.g a',
        resultTitle: 'h3'
    },
    'bing.com': {
        searchInput: 'input[name="q"]',
        firstResult: 'li.b_algo h2 a'
    },
    'duckduckgo.com': {
        searchInput: 'input[name="q"]',
        firstResult: 'div.result__title a'
    },
    'youtube.com': {
        searchInput: 'input#search',
        firstResult: 'ytd-video-renderer a#thumbnail'
    }
};

export const getSelectorForDomain = (url, key) => {
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        if (LocalSelectors[domain] && LocalSelectors[domain][key]) {
            return LocalSelectors[domain][key];
        }
    } catch (e) {
        // invalid url
    }
    return null;
};
