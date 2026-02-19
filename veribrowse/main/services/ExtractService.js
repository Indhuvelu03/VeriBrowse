/**
 * ExtractService
 *
 * Extracts clean, readable article text from a page.
 *
 * Strategy:
 *   1. Nuke all known noise elements (nav, ads, banners, scripts)
 *   2. Walk a priority list of semantic content selectors
 *   3. Pick the first one with enough text (> 300 chars)
 *   4. Fall back to document.body if nothing qualifies
 *   5. Return title + url + clean text
 */
export default class ExtractService {

    /**
     * Extracts clean content from a Playwright Page or Electron WebContents.
     * @param {object} page - Playwright Page (has .evaluate()) or Electron WebContents (has .executeJavaScript())
     */
    async extractCleanContent(page) {
        try {
            console.log('[ExtractService] Extracting clean article content...');

            const extractionScript = `
                (() => {
                    // ─────────────────────────────────────────────────────
                    // STEP 1: Remove all known noise from the DOM
                    // ─────────────────────────────────────────────────────
                    const NOISE_SELECTORS = [
                        // Structural chrome
                        'nav', 'header', 'footer', 'aside',
                        // ARIA roles for chrome
                        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
                        '[role="complementary"]', '[role="search"]',
                        // Scripts & styles
                        'script', 'style', 'noscript', 'iframe', 'svg',
                        // Ads
                        '[class*="ad-"]', '[class*="-ad"]', '[class*="ads"]',
                        '[id*="ad-"]', '[id*="-ad"]', '[id*="ads"]',
                        '[class*="advertisement"]', '[id*="advertisement"]',
                        '[class*="sponsored"]', '[class*="promo"]',
                        // Cookie / GDPR banners
                        '[class*="cookie"]', '[id*="cookie"]',
                        '[class*="gdpr"]', '[id*="gdpr"]',
                        '[class*="consent"]', '[id*="consent"]',
                        '[class*="banner"]', '[id*="banner"]',
                        '[class*="popup"]', '[id*="popup"]',
                        // Social share / reactions
                        '[class*="social"]', '[class*="share"]',
                        '[class*="reaction"]', '[class*="like-button"]',
                        // Sticky / fixed elements (usually nav or cookie bars)
                        // Comment sections
                        '[class*="comment"]', '[id*="comment"]',
                        '[class*="disqus"]', '[id*="disqus"]',
                        // Newsletter / subscription widgets
                        '[class*="newsletter"]', '[class*="subscribe"]',
                        '[class*="signup"]', '[class*="sign-up"]',
                        // Related articles / sidebar widgets
                        '[class*="related"]', '[class*="recommended"]',
                        '[class*="sidebar"]', '[class*="widget"]',
                        // Paywall overlays
                        '[class*="paywall"]', '[class*="subscription"]',
                        '[class*="premium"]',
                    ];

                    // Clone body so we can safely mutate without affecting the live page
                    const bodyClone = document.body.cloneNode(true);

                    NOISE_SELECTORS.forEach(sel => {
                        try {
                            bodyClone.querySelectorAll(sel).forEach(el => el.remove());
                        } catch(e) { /* ignore invalid selector */ }
                    });

                    // Also remove hidden elements
                    bodyClone.querySelectorAll('*').forEach(el => {
                        try {
                            const style = window.getComputedStyle(el);
                            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                                el.remove();
                            }
                        } catch(e) {}
                    });

                    // ─────────────────────────────────────────────────────
                    // STEP 2: Priority-ordered semantic content selectors
                    // ─────────────────────────────────────────────────────
                    const CONTENT_SELECTORS = [
                        'article',
                        'main',
                        '#mw-content-text',
                        '[role="main"]',
                        '[role="article"]',
                        '.article',
                        '.post',
                        '.post-content',
                        '.article-content',
                        '.article-body',
                        '.story-body',
                        '.entry-content',
                        '.page-content',
                        '.content-body',
                        '#article-body',
                        '#content',
                        '#main-content',
                        '.main-content',
                    ];

                    const MIN_CONTENT_LENGTH = 300;

                    let contentEl = null;

                    for (const selector of CONTENT_SELECTORS) {
                        const el = bodyClone.querySelector(selector);
                        if (el) {
                            const text = el.innerText?.trim() || '';
                            if (text.length >= MIN_CONTENT_LENGTH) {
                                contentEl = el;
                                break;
                            }
                        }
                    }

                    // STEP 3: Fall back to the cleaned body
                    if (!contentEl) {
                        contentEl = bodyClone;
                    }

                    // ─────────────────────────────────────────────────────
                    // STEP 4: Clean and normalise the text
                    // ─────────────────────────────────────────────────────
                    let rawText = contentEl.innerText || '';

                    // Collapse excessive whitespace / blank lines
                    rawText = rawText
                        .replace(/[ \\t]+/g, ' ')           // collapse spaces/tabs
                        .replace(/\\n{3,}/g, '\\n\\n')        // max 2 consecutive newlines
                        .trim();

                    return {
                        title: document.title || '',
                        url: window.location.href || '',
                        textContent: rawText,
                        length: rawText.length,
                        selector: contentEl === bodyClone ? 'body (fallback)' : 'semantic'
                    };
                })()
            `;

            let result;
            if (typeof page.evaluate === 'function') {
                // Playwright Page
                result = await page.evaluate(extractionScript);
            } else if (typeof page.executeJavaScript === 'function') {
                // Electron WebContents
                result = await page.executeJavaScript(extractionScript);
            } else {
                throw new Error('[ExtractService] Unsupported page object — needs evaluate() or executeJavaScript()');
            }

            console.log(`[ExtractService] Extracted ${result.length} chars via ${result.selector} from "${result.title}"`);

            return {
                success: true,
                title: result.title,
                url: result.url,
                textContent: result.textContent,
                length: result.length,
            };

        } catch (error) {
            console.error('[ExtractService] Extraction error:', error.message);
            return {
                success: false,
                error: error.message,
                textContent: '',
                length: 0,
            };
        }
    }
}
