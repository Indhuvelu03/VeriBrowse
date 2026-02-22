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
      var noiseSelectors = [
        'nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe',
        'aside', '.ads', '.ad-unit', '#consent-banner', '.cookie-notice',
        '.social-share', '.sidebar'
      ];
      const clone = document.body.cloneNode(true);
      for (var i = 0; i < noiseSelectors.length; i++) {
        var s = noiseSelectors[i];
        var noisy = clone.querySelectorAll(s);
        for (var j = 0; j < noisy.length; j++) {
          noisy[j].remove();
        }
      }

      // 2. Extract meaningful text
      // Use regex-based trim — Babel polyfills .trim()/.join()/.split() breaking eval
      var rawLines = clone.innerText.split('\n');
      var cleanLines = [];
      for (var k = 0; k < rawLines.length; k++) {
        var line = rawLines[k].replace(/^\s+|\s+$/g, '');
        if (line.length > 0) cleanLines.push(line);
      }
      var text = cleanLines.join('\n');

      // 3. Extract links (if requested)
      var links = [];
      if (shouldLinks) {
        var aEls = clone.querySelectorAll('a[href]');
        for (var l = 0; l < aEls.length; l++) {
          var a = aEls[l];
          var aText = (a.innerText || '').replace(/^\s+|\s+$/g, '');
          var aUrl = a.href || '';
          if (aText.length > 2 && aUrl.indexOf('http') === 0) {
            links.push({ text: aText, url: aUrl });
          }
          if (links.length >= 50) break;
        }
      }

      var wordCount = 0;
      var wordParts = text.split(/\s+/);
      for (var wi = 0; wi < wordParts.length; wi++) {
        if (wordParts[wi].length > 0) wordCount++;
      }

      return {
        text: text.substring(0, 50000),
        links: links,
        wordCount: wordCount
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
