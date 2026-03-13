import browserManager from '../BrowserManager.js';
import * as CreditGuard from '../CreditGuard.js';
import UIFeedback from '../UIFeedback.js';
import bus from '../EventBus.js';

const SUPPORTED_SITES = Object.freeze({
    amazon: {
        key: 'amazon',
        label: 'Amazon',
        aliases: ['amazon', 'amazon.in', 'amazon.com'],
        buildSearchUrl: (query) => `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
    },
    flipkart: {
        key: 'flipkart',
        label: 'Flipkart',
        aliases: ['flipkart', 'flipkart.com'],
        buildSearchUrl: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    },
});

const SITE_ORDER = ['amazon', 'flipkart'];
const COMPARE_PATTERN = /\b(compare|comparison|vs|versus|cheapest|lowest\s+price|best\s+price)\b/i;
const PRICE_PATTERN = /\b(price|cost|deal|offer|discount)\b/i;

let activeAbortController = null;

function nowIso() {
    return new Date().toISOString();
}

function normalizeSpace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
    return normalizeSpace(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t && t.length > 1);
}

function unique(items) {
    return [...new Set(items)];
}

function checkAbort(signal) {
    if (signal?.aborted) {
        throw new DOMException('Comparison cancelled by user', 'AbortError');
    }
}

function parsePriceValue(priceText) {
    const raw = String(priceText || '');
    if (!raw) return null;
    const clean = raw.replace(/,/g, '');
    const match = clean.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
}

function detectCurrency(priceText) {
    const raw = String(priceText || '');
    if (/(?:\u20B9|inr|rs\.?)/i.test(raw)) return 'INR';
    if (/\$/i.test(raw)) return 'USD';
    if (/\u20AC/.test(raw)) return 'EUR';
    if (/\u00A3/.test(raw)) return 'GBP';
    return null;
}

function parseRating(ratingText) {
    const raw = String(ratingText || '');
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
}

function parseReviewCount(reviewText) {
    const raw = String(reviewText || '').replace(/,/g, '');
    const match = raw.match(/(\d{1,7})/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
}

function parseStorage(text) {
    const raw = String(text || '');
    const m = raw.match(/\b(\d{2,4}\s?(?:gb|tb))\b/i);
    return m ? m[1].toUpperCase().replace(/\s+/g, ' ') : null;
}

function parseColor(text) {
    const raw = String(text || '');
    const m = raw.match(/\b(black|blue|pink|green|yellow|white|red|purple|midnight|starlight|silver|gold)\b/i);
    return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

function scoreMatch(title, queryTokens) {
    if (!title || !queryTokens.length) return 0;
    const hay = new Set(tokenize(title));
    if (!hay.size) return 0;
    let hits = 0;
    for (const token of queryTokens) {
        if (hay.has(token)) hits++;
    }
    return hits / queryTokens.length;
}

function toSafeUrl(url, base = '') {
    try {
        return new URL(String(url || ''), base || undefined).toString();
    } catch {
        return '';
    }
}

function toDisplayPrice(priceValue, currency, fallback = '') {
    if (!Number.isFinite(priceValue)) return fallback || 'N/A';
    const amount = currency === 'INR'
        ? priceValue.toLocaleString('en-IN')
        : priceValue.toLocaleString('en-US');
    if (currency === 'INR') return `INR ${amount}`;
    if (currency === 'USD') return `$${amount}`;
    if (currency === 'EUR') return `EUR ${amount}`;
    if (currency === 'GBP') return `GBP ${amount}`;
    return String(priceValue);
}

function detectMentionedSites(lowerGoal) {
    const found = [];
    for (const key of SITE_ORDER) {
        const cfg = SUPPORTED_SITES[key];
        if (!cfg) continue;
        const hit = cfg.aliases.some((alias) => new RegExp(`\\b${alias.replace('.', '\\.')}\\b`, 'i').test(lowerGoal));
        if (hit) found.push(key);
    }
    return unique(found);
}

function removeSiteAliases(text) {
    let out = String(text || '');
    for (const key of SITE_ORDER) {
        const cfg = SUPPORTED_SITES[key];
        for (const alias of cfg.aliases) {
            out = out.replace(new RegExp(`\\b${alias.replace('.', '\\.')}\\b`, 'ig'), ' ');
        }
    }
    return out;
}

function extractProductQuery(goal) {
    const raw = normalizeSpace(goal);
    if (!raw) return '';

    const quoted = raw.match(/"([^"]+)"/);
    if (quoted?.[1]) {
        return normalizeSpace(quoted[1]);
    }

    const patterns = [
        /\bcompare(?:\s+the)?(?:\s+prices?)?(?:\s+of|\s+for)?\s+(.+?)\s+(?:on|in|across|between|at)\b/i,
        /\b(?:find|get|show)\s+(.+?)\s+(?:price|prices)\s+(?:on|in|across|between|at)\b/i,
        /\bprice(?:\s+of|\s+for)?\s+(.+?)\s+(?:on|in|across|between|at)\b/i,
    ];

    for (const re of patterns) {
        const m = raw.match(re);
        if (m?.[1]) {
            const candidate = normalizeSpace(removeSiteAliases(m[1]));
            if (candidate.length >= 2) return candidate;
        }
    }

    let fallback = removeSiteAliases(raw);
    fallback = fallback.replace(/\b(compare|comparison|price|prices|cost|deal|offer|discount|on|in|across|between|at|and|with|vs|versus|find|get|show|please|can you|could you|for me|the)\b/ig, ' ');
    return normalizeSpace(fallback);
}

export function parsePriceComparisonGoal(goal) {
    const cleanGoal = normalizeSpace(goal);
    if (!cleanGoal) return null;

    const lower = cleanGoal.toLowerCase();
    if (!COMPARE_PATTERN.test(lower) && !PRICE_PATTERN.test(lower)) return null;

    const sites = detectMentionedSites(lower);
    if (sites.length < 2) return null;

    const productQuery = extractProductQuery(cleanGoal);
    if (!productQuery || productQuery.length < 2) return null;

    return { goal: cleanGoal, productQuery, sites };
}

async function dismissFlipkartInterruptions(page) {
    const selectors = [
        'button._2KpZ6l._2doB4z',
        'button:has-text("Close")',
        'button[aria-label*="close" i]',
    ];

    for (const selector of selectors) {
        try {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 500 })) {
                await btn.click({ timeout: 2000 });
                await page.waitForTimeout(120);
                return;
            }
        } catch {
            // ignore
        }
    }

    try {
        await page.keyboard.press('Escape');
    } catch {
        // ignore
    }
}

async function extractAmazonItems(page, queryTokens) {
    const CARD_SELECTOR = '[data-component-type="s-search-result"], div.s-result-item[data-asin], div[data-asin][data-index], div[data-cel-widget^="search_result_"]';
    const rawOrganic = [];
    const rawFallback = [];
    const seen = new Set();

    async function firstText(card, selectors) {
        for (const selector of selectors) {
            const loc = card.locator(selector).first();
            const value = normalizeSpace(await loc.textContent({ timeout: 120 }).catch(() => ''));
            if (value) return value;
        }
        return '';
    }

    async function firstAttr(card, selectors, attr) {
        for (const selector of selectors) {
            const loc = card.locator(selector).first();
            const value = normalizeSpace(await loc.getAttribute(attr, { timeout: 120 }).catch(() => ''));
            if (value) return value;
        }
        return '';
    }

    async function collectFeatures(card) {
        const out = [];
        const seenLocal = new Set();
        const featureLoc = card.locator('ul li, [data-cy="title-recipe"] li, .a-row.a-size-base.a-color-secondary span');
        const count = Math.min(await featureLoc.count().catch(() => 0), 12);
        for (let i = 0; i < count; i++) {
            const text = normalizeSpace(await featureLoc.nth(i).textContent({ timeout: 80 }).catch(() => ''));
            if (!text || text.length < 3 || seenLocal.has(text)) continue;
            seenLocal.add(text);
            out.push(text);
            if (out.length >= 6) break;
        }
        return out;
    }

    const cards = page.locator(CARD_SELECTOR);
    const cardCount = Math.min(await cards.count().catch(() => 0), 30);
    for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        const blob = normalizeSpace(await card.innerText({ timeout: 180 }).catch(() => ''));
        if (!blob) continue;

        const title = await firstText(card, [
            'h2 a span',
            'h2 span',
            '[data-cy="title-recipe"] h2',
            'a.a-link-normal.s-underline-text.s-underline-link-text.s-link-style.a-text-normal',
        ]);
        let priceText = await firstText(card, [
            '.a-price .a-offscreen',
            'span.a-price span.a-offscreen',
            'span.a-price-whole',
        ]);
        if (!priceText) {
            const m = blob.match(/(?:\u20B9|rs\.?|inr)\s?[\d,]+(?:\.\d+)?/i);
            priceText = m ? normalizeSpace(m[0]) : '';
        }
        if (!title || !priceText) continue;

        const href = await firstAttr(card, [
            'h2 a.a-link-normal[href]',
            'a.a-link-normal.s-no-outline[href]',
            'a.a-link-normal[href*="/dp/"]',
            'a.a-link-normal[href*="/gp/aw/d/"]',
            'a.a-link-normal[href]',
            'a[href*="/dp/"]',
        ], 'href');
        const ratingText = await firstText(card, [
            '.a-icon-alt',
            '[aria-label*="out of 5 stars"]',
        ]);
        const reviewsText = await firstText(card, [
            'span.a-size-base.s-underline-text',
            'span[aria-label*="ratings"]',
        ]);
        let imageUrl = await firstAttr(card, [
            'img.s-image',
            'img[data-image-latency="s-product-image"]',
            'img',
        ], 'src');
        if (!imageUrl) {
            const srcset = await firstAttr(card, [
                'img.s-image',
                'img[data-image-latency="s-product-image"]',
                'img',
            ], 'srcset');
            if (srcset) {
                imageUrl = normalizeSpace(srcset.split(',')[0]?.trim().split(/\s+/)[0] || '');
            }
        }
        const features = await collectFeatures(card);
        const sponsoredBadge = await firstText(card, [
            'span.s-label-popover-default',
            'span.puis-sponsored-label-text',
            '[aria-label*="Sponsored" i]',
        ]);
        const sponsored = Boolean(sponsoredBadge) || /\bsponsored\b/i.test(blob);
        const item = {
            title,
            priceText,
            ratingText,
            reviewsText,
            url: href,
            imageUrl,
            features,
            sponsored,
        };
        const key = `${item.url || ''}|${item.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (sponsored) rawFallback.push(item);
        else rawOrganic.push(item);
        if (rawOrganic.length >= 12 || (rawOrganic.length + rawFallback.length) >= 20) break;
    }

    if (rawOrganic.length === 0 && rawFallback.length === 0) {
        const anchors = page.locator('a[href*="/dp/"], a[href*="/gp/aw/d/"]');
        const anchorCount = Math.min(await anchors.count().catch(() => 0), 40);
        for (let i = 0; i < anchorCount; i++) {
            const a = anchors.nth(i);
            const title = normalizeSpace(
                (await a.getAttribute('title', { timeout: 120 }).catch(() => '')) ||
                (await a.textContent({ timeout: 120 }).catch(() => ''))
            );
            if (!title || title.length < 5) continue;

            const href = normalizeSpace(await a.getAttribute('href', { timeout: 120 }).catch(() => ''));
            const container = a.locator('xpath=ancestor::*[@data-component-type="s-search-result" or @data-asin or starts-with(@data-cel-widget,"search_result_")][1]').first();
            const blob = normalizeSpace(
                (await container.innerText({ timeout: 120 }).catch(() => '')) ||
                (await a.innerText({ timeout: 120 }).catch(() => ''))
            );
            const priceMatch = blob.match(/(?:\u20B9|rs\.?|inr)\s?[\d,]+(?:\.\d+)?/i);
            const priceText = priceMatch ? normalizeSpace(priceMatch[0]) : '';
            if (!priceText) continue;

            const key = `${href}|${title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rawFallback.push({
                title,
                priceText,
                ratingText: '',
                reviewsText: '',
                url: href,
                imageUrl: '',
                features: [],
                sponsored: false,
            });
            if (rawFallback.length >= 12) break;
        }
    }

    const rawItems = rawOrganic.length ? rawOrganic : rawFallback;

    return rawItems
        .map((item) => {
            const priceValue = parsePriceValue(item.priceText);
            return {
                site: 'amazon',
                title: normalizeSpace(item.title).slice(0, 240),
                url: toSafeUrl(item.url, 'https://www.amazon.in'),
                priceText: normalizeSpace(item.priceText),
                priceValue,
                currency: detectCurrency(item.priceText) || 'INR',
                ratingText: normalizeSpace(item.ratingText),
                ratingValue: parseRating(item.ratingText),
                reviewsText: normalizeSpace(item.reviewsText),
                reviewCount: parseReviewCount(item.reviewsText),
                imageUrl: toSafeUrl(item.imageUrl, 'https://www.amazon.in'),
                keyFeatures: Array.isArray(item.features)
                    ? item.features.map((x) => normalizeSpace(x)).filter(Boolean).slice(0, 5)
                    : [],
                storage: parseStorage(item.title),
                color: parseColor(item.title),
                matchScore: scoreMatch(item.title, queryTokens),
            };
        })
        .filter((item) => item.title && item.priceText);
}

async function diagnoseAmazonExtractionIssue(page) {
    try {
        const text = normalizeSpace(await page.locator('body').innerText({ timeout: 1800 }).catch(() => '')).toLowerCase();
        if (!text) return 'empty_document_text';
        if (/sorry,\s*we just need to make sure you (are|\'re) not a robot/i.test(text)) return 'bot_challenge';
        if (/enter the characters you see below|type the characters you see in this image/i.test(text)) return 'bot_challenge';
        if (/dog of amazon|something went wrong/i.test(text)) return 'amazon_error_page';
        const count = await page
            .locator('[data-component-type="s-search-result"], div.s-result-item[data-asin], div[data-asin][data-index], div[data-cel-widget^="search_result_"]')
            .count()
            .catch(() => 0);
        if (!count) return 'no_result_cards_detected';
        return 'selectors_missed_content';
    } catch {
        return 'diagnostics_failed';
    }
}

async function extractFlipkartItems(page, queryTokens) {
    const rawItems = await page.evaluate(function () {
        function tr(v) { return v ? String(v).replace(/^\s+|\s+$/g, '') : ''; }
        function clean(v) { return tr(v).replace(/\s+/g, ' '); }
        var out = [];
        var cards = document.querySelectorAll('div[data-id], div._75nlfW, div.slAVV4, div.tUxRFH');

        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var titleEl =
                card.querySelector('a[title]') ||
                card.querySelector('div.KzDlHZ') ||
                card.querySelector('div._4rR01T') ||
                card.querySelector('a.s1Q9rs') ||
                card.querySelector('a.wjcEIp');
            var linkEl =
                card.querySelector('a[href*="/p/"]') ||
                card.querySelector('a[href*="/itm/"]') ||
                (titleEl ? titleEl.closest('a[href]') : null);
            var priceEl =
                card.querySelector('div.Nx9bqj') ||
                card.querySelector('div._30jeq3') ||
                card.querySelector('div[class*="_30jeq3"]');
            var ratingEl =
                card.querySelector('div.XQDdHH') ||
                card.querySelector('div._3LWZlK');
            var reviewEl =
                card.querySelector('span.Wphh3N') ||
                card.querySelector('span._2_R_DZ');
            var imgEl =
                card.querySelector('img[src], img[srcset]') ||
                (linkEl ? linkEl.querySelector('img[src], img[srcset]') : null);
            var featureEls = card.querySelectorAll('ul li');

            var title = clean((titleEl && (titleEl.getAttribute('title') || titleEl.textContent)) || '');
            var priceText = clean((priceEl && priceEl.textContent) || '');
            if (!title || !priceText) continue;

            var features = [];
            for (var fi = 0; fi < featureEls.length; fi++) {
                var ft = clean(featureEls[fi] && featureEls[fi].textContent);
                if (!ft || ft.length < 3) continue;
                if (features.indexOf(ft) >= 0) continue;
                features.push(ft);
                if (features.length >= 6) break;
            }

            out.push({
                title: title,
                priceText: priceText,
                ratingText: clean((ratingEl && ratingEl.textContent) || ''),
                reviewsText: clean((reviewEl && reviewEl.textContent) || ''),
                url: (linkEl && linkEl.href) || '',
                imageUrl: (imgEl && (imgEl.currentSrc || imgEl.src)) || '',
                features: features,
            });
            if (out.length >= 10) break;
        }

        if (out.length > 0) return out;

        var anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/itm/"]');
        for (var j = 0; j < anchors.length; j++) {
            var a = anchors[j];
            var title2 = clean(a.getAttribute('title') || a.textContent || '');
            if (!title2) continue;
            var container = a.closest('div') || a.parentElement || document.body;
            var blob2 = clean(container.innerText || '');
            var priceMatch = blob2.match(/(?:\u20B9|rs\.?)\s?[\d,]+(?:\.\d+)?/i);
            if (!priceMatch) continue;
            out.push({
                title: title2,
                priceText: clean(priceMatch[0]),
                ratingText: '',
                reviewsText: '',
                url: a.href || '',
                imageUrl: '',
                features: [],
            });
            if (out.length >= 10) break;
        }

        return out;
    });

    return rawItems
        .map((item) => {
            const priceValue = parsePriceValue(item.priceText);
            return {
                site: 'flipkart',
                title: normalizeSpace(item.title).slice(0, 240),
                url: toSafeUrl(item.url, 'https://www.flipkart.com'),
                priceText: normalizeSpace(item.priceText),
                priceValue,
                currency: detectCurrency(item.priceText) || 'INR',
                ratingText: normalizeSpace(item.ratingText),
                ratingValue: parseRating(item.ratingText),
                reviewsText: normalizeSpace(item.reviewsText),
                reviewCount: parseReviewCount(item.reviewsText),
                imageUrl: toSafeUrl(item.imageUrl, 'https://www.flipkart.com'),
                keyFeatures: Array.isArray(item.features)
                    ? item.features.map((x) => normalizeSpace(x)).filter(Boolean).slice(0, 5)
                    : [],
                storage: parseStorage(item.title),
                color: parseColor(item.title),
                matchScore: scoreMatch(item.title, queryTokens),
            };
        })
        .filter((item) => item.title && item.url && item.priceText);
}

function chooseTopItem(items, queryTokens) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items
        .slice()
        .sort((a, b) => {
            const aScore = scoreMatch(a.title, queryTokens);
            const bScore = scoreMatch(b.title, queryTokens);
            if (bScore !== aScore) return bScore - aScore;
            const aPrice = Number.isFinite(a.priceValue) ? a.priceValue : Number.MAX_SAFE_INTEGER;
            const bPrice = Number.isFinite(b.priceValue) ? b.priceValue : Number.MAX_SAFE_INTEGER;
            if (aPrice !== bPrice) return aPrice - bPrice;
            const aRating = Number.isFinite(a.ratingValue) ? a.ratingValue : 0;
            const bRating = Number.isFinite(b.ratingValue) ? b.ratingValue : 0;
            return bRating - aRating;
        })[0];
}

async function extractItemsForSite(siteKey, page, queryTokens) {
    if (siteKey === 'flipkart') {
        await dismissFlipkartInterruptions(page);
        await page.waitForTimeout(250);
    }
    if (siteKey === 'amazon') {
        return extractAmazonItems(page, queryTokens);
    }
    if (siteKey === 'flipkart') {
        return extractFlipkartItems(page, queryTokens);
    }
    return [];
}

async function extractItemsWithRecovery(siteKey, page, queryTokens) {
    let firstError = null;
    let items = [];
    try {
        items = await extractItemsForSite(siteKey, page, queryTokens);
    } catch (err) {
        firstError = String(err?.message || err || 'extract_failed');
        items = [];
    }
    if (items.length) {
        return { items, reason: null };
    }

    const vh = page.viewportSize()?.height || 800;
    await page.mouse.wheel(0, Math.max(1000, Math.floor(vh * 1.5))).catch(() => { });
    await page.keyboard.press('PageDown').catch(() => { });
    await page.waitForTimeout(700);
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => { });

    let secondError = null;
    try {
        items = await extractItemsForSite(siteKey, page, queryTokens);
    } catch (err) {
        secondError = String(err?.message || err || 'extract_retry_failed');
        items = [];
    }
    if (items.length) {
        return { items, reason: 'recovered_after_scroll' };
    }

    if (secondError || firstError) {
        const errText = normalizeSpace(secondError || firstError).slice(0, 140);
        return { items: [], reason: `extract_error:${errText}` };
    }

    let reason = 'no_parseable_listings';
    if (siteKey === 'amazon') {
        reason = await diagnoseAmazonExtractionIssue(page);
    }
    return { items: [], reason };
}

async function runSiteBranch({ siteKey, productQuery, signal, reuseTabId = null }) {
    checkAbort(signal);
    const cfg = SUPPORTED_SITES[siteKey];
    if (!cfg) {
        return { site: siteKey, label: siteKey, ok: false, error: `Unsupported site: ${siteKey}`, items: [], topItem: null };
    }

    let tabId = reuseTabId;
    let page = null;
    let reusedCurrentTab = false;

    if (tabId && browserManager.userTabs.has(tabId)) {
        page = browserManager.getPage(tabId);
        if (page && !page.isClosed()) {
            reusedCurrentTab = true;
        } else {
            page = null;
        }
    }

    if (!page) {
        tabId = `cmp-${siteKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        page = await browserManager.createUserTab(tabId, 'about:blank');
        browserManager.sendToRenderer('browser:user-tab-created', {
            id: tabId,
            url: 'about:blank',
            title: `${cfg.label} Compare`,
            favicon: null,
            isLoading: false,
        });
    }

    UIFeedback.emitStep({
        thought: reusedCurrentTab
            ? `Using current tab for ${cfg.label} price collection`
            : `Opened ${cfg.label} tab for price collection`,
        action: reusedCurrentTab ? `REUSE_TAB ${cfg.label}` : `OPEN_TAB ${cfg.label}`,
        status: 'running',
    });

    const queryTokens = tokenize(productQuery);
    const searchUrl = cfg.buildSearchUrl(productQuery);

    try {
        await page.bringToFront().catch(() => { });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => { });
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => { });
        await page.waitForTimeout(1300);
        checkAbort(signal);

        const extraction = await extractItemsWithRecovery(siteKey, page, queryTokens);
        const items = extraction.items;
        const topItem = chooseTopItem(items, queryTokens);
        if (!items.length) {
            console.warn(`[PriceComparisonOrchestrator] ${cfg.label} extraction empty: ${extraction.reason || 'unknown_reason'} @ ${page.url()}`);
        }

        UIFeedback.emitStep({
            thought: items.length
                ? `Collected ${items.length} listing${items.length === 1 ? '' : 's'} from ${cfg.label}`
                : `No listings parsed from ${cfg.label}${extraction.reason ? ` (${extraction.reason})` : ''}`,
            action: `EXTRACT ${cfg.label}`,
            status: items.length > 0 ? 'success' : 'warn',
        });

        return {
            site: siteKey,
            label: cfg.label,
            tabId,
            searchUrl,
            pageUrl: page.url(),
            pageTitle: await page.title().catch(() => cfg.label),
            startedAt: nowIso(),
            completedAt: nowIso(),
            ok: items.length > 0,
            error: items.length > 0
                ? null
                : `No product listings extracted from ${cfg.label}${extraction.reason ? ` (${extraction.reason})` : ''}`,
            items: items.map((item) => ({
                ...item,
                url: item.url || searchUrl,
            })),
            topItem: topItem
                ? {
                    ...topItem,
                    url: topItem.url || searchUrl,
                }
                : null,
        };
    } catch (err) {
        console.warn(`[PriceComparisonOrchestrator] ${cfg.label} branch failed: ${err?.message || err}`);
        return {
            site: siteKey,
            label: cfg.label,
            tabId,
            searchUrl,
            pageUrl: page.url(),
            pageTitle: cfg.label,
            startedAt: nowIso(),
            completedAt: nowIso(),
            ok: false,
            error: err?.name === 'AbortError' ? 'Cancelled by user' : String(err.message || err),
            items: [],
            topItem: null,
        };
    }
}

async function retryBranchExtractionIfNeeded(branch, productQuery) {
    if (!branch || (branch.ok && branch.topItem) || !branch.tabId || !branch.site) {
        return branch;
    }

    const page = browserManager.getPage(branch.tabId);
    if (!page || page.isClosed()) {
        return branch;
    }

    const queryTokens = tokenize(productQuery);
    UIFeedback.emitStep({
        thought: `Retrying ${branch.label || branch.site} extraction from its active tab`,
        action: `RETRY_EXTRACT ${branch.label || branch.site}`,
        status: 'running',
    });

    try {
        browserManager.setActiveTab(branch.tabId, { emit: true });
        await page.bringToFront().catch(() => { });
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => { });
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => { });
        await page.waitForTimeout(600);

        const extraction = await extractItemsWithRecovery(branch.site, page, queryTokens);
        const items = extraction.items;
        const topItem = chooseTopItem(items, queryTokens);
        if (!items.length || !topItem) {
            console.warn(`[PriceComparisonOrchestrator] Retry failed for ${branch.label || branch.site}: ${extraction.reason || 'unknown_reason'} @ ${page.url()}`);
            return {
                ...branch,
                completedAt: nowIso(),
                error: branch.error || `No product listings extracted from ${branch.label || branch.site}${extraction.reason ? ` (${extraction.reason})` : ''}`,
            };
        }

        UIFeedback.emitStep({
            thought: `Recovered ${branch.label || branch.site} data on active-tab retry`,
            action: `RETRY_EXTRACT ${branch.label || branch.site}`,
            status: 'success',
        });

        return {
            ...branch,
            ok: true,
            error: null,
            items: items.map((item) => ({
                ...item,
                url: item.url || branch.searchUrl || page.url(),
            })),
            topItem: {
                ...topItem,
                url: topItem.url || branch.searchUrl || page.url(),
            },
            pageUrl: page.url(),
            pageTitle: await page.title().catch(() => branch.pageTitle || branch.label || branch.site),
            completedAt: nowIso(),
        };
    } catch {
        return branch;
    }
}

function buildComparisonData(parsed, branches) {
    const successful = branches.filter((b) => b.ok && b.topItem);
    const comparable = successful.filter((b) => Number.isFinite(b.topItem?.priceValue));
    const cheapest = comparable.length
        ? comparable.slice().sort((a, b) => a.topItem.priceValue - b.topItem.priceValue)[0]
        : null;

    return {
        query: parsed.productQuery,
        sites: parsed.sites,
        branches,
        successfulBranches: successful.length,
        failedBranches: branches.length - successful.length,
        cheapest: cheapest
            ? {
                site: cheapest.site,
                label: cheapest.label,
                title: cheapest.topItem.title,
                url: cheapest.topItem.url,
                priceValue: cheapest.topItem.priceValue,
                priceText: cheapest.topItem.priceText,
                currency: cheapest.topItem.currency,
            }
            : null,
    };
}

function buildDeterministicReport(data) {
    const lines = [];
    lines.push(`Price Comparison: ${data.query}`);
    lines.push('');

    for (const branch of data.branches) {
        lines.push(`${branch.label || branch.site}`);
        if (!branch.topItem) {
            lines.push('- Product: N/A');
            lines.push('- Price: N/A');
            lines.push(`- Status: ${branch.error || 'No matched result'}`);
            lines.push('');
            continue;
        }

        const item = branch.topItem;
        const price = toDisplayPrice(item.priceValue, item.currency, item.priceText || 'N/A');
        const rating = item.ratingValue != null ? `${item.ratingValue}/5` : (item.ratingText || 'N/A');
        const featureText = item.keyFeatures && item.keyFeatures.length
            ? item.keyFeatures.slice(0, 3).join(' | ')
            : 'N/A';

        lines.push(`- Product: ${item.title}`);
        lines.push(`- Variant: ${item.storage || 'N/A'}${item.color ? `, ${item.color}` : ''}`);
        lines.push(`- Price: ${price}`);
        lines.push(`- Rating: ${rating}`);
        lines.push(`- Key Features: ${featureText}`);
        lines.push(`- Link: ${item.url || 'N/A'}`);
        if (item.imageUrl) {
            lines.push(`- Image: ${item.imageUrl}`);
        }
        lines.push('');
    }

    lines.push('Compared Prices');
    for (const branch of data.branches) {
        if (!branch.topItem) {
            lines.push(`- ${branch.label || branch.site}: N/A`);
            continue;
        }
        const item = branch.topItem;
        const price = toDisplayPrice(item.priceValue, item.currency, item.priceText || 'N/A');
        lines.push(`- ${branch.label || branch.site}: ${price}`);
    }

    lines.push('');
    if (data.cheapest) {
        const bestPrice = toDisplayPrice(data.cheapest.priceValue, data.cheapest.currency, data.cheapest.priceText || 'N/A');
        lines.push(`Best current price: ${data.cheapest.label} at ${bestPrice}`);
    } else {
        lines.push('Best current price: Not enough numeric price data to determine.');
    }

    lines.push('');
    lines.push('Feature Comparison');
    for (const branch of data.branches) {
        const item = branch.topItem;
        if (!item) {
            lines.push(`- ${branch.label || branch.site}: N/A`);
            continue;
        }
        const features = item.keyFeatures && item.keyFeatures.length
            ? item.keyFeatures.slice(0, 4).join(' | ')
            : 'N/A';
        lines.push(`- ${branch.label || branch.site}: Storage=${item.storage || 'N/A'}, Color=${item.color || 'N/A'}, Features=${features}`);
    }

    const failures = data.branches.filter((b) => !b.ok);
    if (failures.length) {
        lines.push('');
        lines.push('Branch notes');
        for (const branch of failures) {
            lines.push(`- ${branch.label || branch.site}: ${branch.error || 'No data extracted'}`);
        }
    }

    return lines.join('\n');
}

async function summarizeComparisonWithLLM(goal, data) {
    const payload = {
        goal,
        query: data.query,
        cheapest: data.cheapest,
        branches: data.branches.map((b) => ({
            site: b.site,
            label: b.label,
            tabId: b.tabId,
            searchUrl: b.searchUrl,
            ok: b.ok,
            error: b.error,
            topItem: b.topItem,
            alternatives: (b.items || []).slice(0, 3),
        })),
        generatedAt: nowIso(),
    };

    const prompt = `You are VeriBrowse AI. Produce a concise plain-text comparison report.\nUse only this JSON data and do not fabricate values.\n\nRequired sections:\n1) Best current price\n2) Per-site details: Product, Variant, Price, Rating, Key Features, Link, Image URL (if available)\n3) Feature Comparison\n4) Branch notes (only if needed)\n\nJSON DATA:\n${JSON.stringify(payload, null, 2).slice(0, 11000)}`;
    try {
        const response = await CreditGuard.generate(prompt);
        const text = typeof response === 'string' ? response.trim() : '';
        const hasSiteNames = data.branches.every((b) => text.toLowerCase().includes(String(b.label || b.site).toLowerCase()));
        const hasPriceWord = /\bprice\b/i.test(text);
        const hasProductWord = /\bproduct\b/i.test(text);
        if (text.length > 40 && hasSiteNames && hasPriceWord && hasProductWord) {
            return { report: response.trim(), llmUsed: true };
        }
    } catch (err) {
        console.warn('[PriceComparisonOrchestrator] LLM summary failed, falling back:', err.message);
    }
    return { report: buildDeterministicReport(data), llmUsed: false };
}

export async function runParallelPriceComparison(goal, parsedInput = null) {
    const parsed = parsedInput || parsePriceComparisonGoal(goal);
    if (!parsed) {
        return { success: false, handled: false, error: 'Goal is not a supported multi-site price comparison request.' };
    }

    if (activeAbortController) {
        return { success: false, handled: true, error: 'A price comparison is already running.' };
    }

    const abortController = new AbortController();
    activeAbortController = abortController;
    const originalActiveTabId = browserManager.activeTabId;

    UIFeedback.emit({
        message: `Comparing "${parsed.productQuery}" across ${parsed.sites.map((s) => SUPPORTED_SITES[s]?.label || s).join(', ')}...`,
        status: 'planning',
    });
    UIFeedback.emitStep({
        thought: `Launching ${parsed.sites.length} comparison branches in parallel`,
        action: 'COMPARE_START',
        status: 'running',
    });

    try {
        const settled = await Promise.allSettled(
            parsed.sites.map((siteKey, idx) =>
                runSiteBranch({
                    siteKey,
                    productQuery: parsed.productQuery,
                    signal: abortController.signal,
                    reuseTabId: idx === 0 ? (originalActiveTabId || null) : null,
                })
            )
        );

        const initialBranches = settled.map((entry, idx) => {
            if (entry.status === 'fulfilled') return entry.value;
            const siteKey = parsed.sites[idx];
            return {
                site: siteKey,
                label: SUPPORTED_SITES[siteKey]?.label || siteKey,
                tabId: null,
                searchUrl: SUPPORTED_SITES[siteKey]?.buildSearchUrl(parsed.productQuery) || null,
                pageUrl: null,
                pageTitle: SUPPORTED_SITES[siteKey]?.label || siteKey,
                startedAt: nowIso(),
                completedAt: nowIso(),
                ok: false,
                error: entry.reason?.message || 'Branch failed',
                items: [],
                topItem: null,
            };
        });

        const branches = [];
        for (const branch of initialBranches) {
            branches.push(await retryBranchExtractionIfNeeded(branch, parsed.productQuery));
        }

        const data = buildComparisonData(parsed, branches);
        const { report, llmUsed } = await summarizeComparisonWithLLM(goal, data);

        UIFeedback.emitStep({
            thought: `Comparison complete: ${data.successfulBranches}/${branches.length} branches produced results`,
            action: 'COMPARE_DONE',
            status: data.successfulBranches > 0 ? 'success' : 'warn',
        });

        bus.emit('agent:chat-response', { goal, response: report });
        browserManager.sendToRenderer('agent:autonomous-done', {
            result: {
                success: data.successfulBranches > 0,
                state: data.successfulBranches > 0 ? 'DONE' : 'ABORTED',
                stepCount: branches.length,
                llmCalls: llmUsed ? 1 : 0,
                lastStep: { type: 'DONE', result: report },
            },
        });
        UIFeedback.emit('READY');

        return {
            success: data.successfulBranches > 0,
            handled: true,
            result: {
                query: data.query,
                branches,
                cheapest: data.cheapest,
                report,
            },
        };
    } catch (err) {
        const isAbort = err?.name === 'AbortError';
        const message = isAbort ? 'Comparison cancelled by user.' : `Comparison failed: ${err.message}`;
        if (isAbort) {
            bus.emit('agent:chat-response', { goal, response: 'Price comparison cancelled.' });
        } else {
            bus.emit('agent:error', { error: message });
        }
        UIFeedback.emit('FAILED', message);
        return { success: false, handled: true, error: message };
    } finally {
        if (originalActiveTabId && browserManager.userTabs.has(originalActiveTabId)) {
            browserManager.setActiveTab(originalActiveTabId, { emit: true });
        }
        activeAbortController = null;
    }
}

export function cancelActivePriceComparison() {
    if (activeAbortController) {
        activeAbortController.abort();
    }
}
