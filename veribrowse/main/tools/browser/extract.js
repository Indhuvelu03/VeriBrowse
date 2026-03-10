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
      function tr(s) { return s ? s.replace(/^\s+|\s+$/g, '') : ''; }
      function isAdUrl(url) {
        var u = tr(url || '');
        if (!u) return false;
        return (
          /googleadservices/i.test(u) ||
          /doubleclick/i.test(u) ||
          /googlesyndication/i.test(u) ||
          /\/aclk/i.test(u) ||
          /adurl=/i.test(u) ||
          /gclid=/i.test(u)
        );
      }

      function nodeLooksSponsored(el) {
        if (!el) return false;
        var blob = tr(
          (el.id || '') + ' ' +
          (typeof el.className === 'string' ? el.className : '') + ' ' +
          (el.getAttribute('aria-label') || '') + ' ' +
          (el.getAttribute('data-testid') || '') + ' ' +
          (el.innerText || '')
        );
        return (
          /sponsored/i.test(blob) ||
          /advertisement/i.test(blob) ||
          /promoted/i.test(blob) ||
          /ads by/i.test(blob) ||
          /ad-container/i.test(blob) ||
          /commercial-unit/i.test(blob) ||
          /tads/i.test(blob)
        );
      }

      function hasSponsoredAncestor(el) {
        var cur = el;
        var depth = 0;
        while (cur && depth < 8) {
          if (nodeLooksSponsored(cur)) return true;
          cur = cur.parentElement;
          depth++;
        }
        return false;
      }

      // 1. Remove noise
      var noiseSelectors = [
        'nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe',
        'aside', '.ads', '.ad-unit', '#consent-banner', '.cookie-notice',
        '.social-share', '.sidebar',
        '#tads', '#tadsb', '[data-text-ad]', '[data-text-ad="1"]',
        '.commercial-unit-desktop-top', '.commercial-unit-desktop-rhs', '.uEierd',
        '[aria-label*="Sponsored" i]', '[class*="sponsored" i]', '[id*="sponsored" i]',
        '[class*="advert" i]', '[id*="advert" i]'
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
        var line = tr(rawLines[k]);
        if (/^sponsored$/i.test(line)) continue;
        if (/^advertisement$/i.test(line)) continue;
        if (line.length > 0) cleanLines.push(line);
      }
      var text = cleanLines.join('\n');

      // 3. Extract links (if requested)
      var links = [];
      var seen = {};
      if (shouldLinks) {
        var aEls = clone.querySelectorAll('a[href]');
        for (var l = 0; l < aEls.length; l++) {
          var a = aEls[l];
          var aText = tr(a.innerText || '');
          var aUrl = a.href || '';
          if (aText.length <= 2) continue;
          if (!/^http/i.test(aUrl)) continue;
          if (isAdUrl(aUrl)) continue;
          if (hasSponsoredAncestor(a)) continue;
          if (nodeLooksSponsored(a)) continue;
          if (seen[aUrl]) continue;

          if (aText.length > 2 && /^http/i.test(aUrl)) {
            links.push({ text: aText, url: aUrl });
            seen[aUrl] = true;
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
