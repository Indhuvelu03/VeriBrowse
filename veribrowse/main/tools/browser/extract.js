/**
 * extract.js
 * 
 * Extract tool — parses the current page and returns clean text + links.
 * ZERO LLM calls. Uses a noise-reducing strategy to strip headers/footers/ads.
 */

export default async function extract(page, { includeLinks = true }) {
  try {
    console.log(`[Tool:Extract] Scraping content from ${page.url()}`);

    const data = await page.evaluate((shouldLinks) => {
      // 1. Remove noise
      const noiseSelectors = [
        'nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe',
        'aside', '.ads', '.ad-unit', '#consent-banner', '.cookie-notice',
        '.social-share', '.sidebar'
      ];

      const clone = document.body.cloneNode(true);
      noiseSelectors.forEach(s => {
        clone.querySelectorAll(s).forEach(el => el.remove());
      });

      // 2. Extract meaningful text
      const text = clone.innerText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

      // 3. Extract links (if requested)
      let links = [];
      if (shouldLinks) {
        links = Array.from(clone.querySelectorAll('a[href]'))
          .map(a => ({
            text: a.innerText.trim(),
            url: a.href
          }))
          .filter(l => l.text.length > 2 && l.url.startsWith('http'))
          .slice(0, 50); // Cap at 50 links for context efficiency
      }

      return {
        text: text.slice(0, 50000), // Safety cap for massive pages
        links,
        wordCount: text.split(/\s+/).length
      };
    }, includeLinks);

    return {
      success: true,
      result: data,
      error: null
    };
  } catch (err) {
    console.error(`[Tool:Extract] Failed: ${err.message}`);
    return {
      success: false,
      result: null,
      error: err.message
    };
  }
}
