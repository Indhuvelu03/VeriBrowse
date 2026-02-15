export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

export const buildSearchUrl = (input) => {
  const trimmed = input.trim();

  // If it's already a valid full URL (e.g. http://example.com), use it.
  if (isValidUrl(trimmed)) {
    return trimmed;
  }

  // Check for localhost with port
  const localhostRegex = /^localhost:\d+$/;
  if (localhostRegex.test(trimmed)) {
    return `http://${trimmed}`;
  }

  // Check for common domain patterns
  // 1. Starts with www.
  if (trimmed.startsWith('www.')) {
    return `https://${trimmed}`;
  }

  // 2. Has a dot and no spaces (likely a domain)
  // Improved regex to handle 2-char TLDs like .ai, .io, .co correctly
  // Pattern: (at least one char + dot) repeated 1 or more times + (2 or more letters at end)
  // This matches "fellou.ai", "google.co.uk", "a.b.c"
  const domainLikeRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

  if (domainLikeRegex.test(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }

  // Default to Google Search
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
};
