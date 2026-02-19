const TOPBAR_HEIGHT = 60;
import { chromium } from 'playwright';

/**
 * BrowserService
 *
 * Two-layer browser architecture:
 *
 *   Layer 1 — Electron BrowserView  (VISIBLE)
 *     Mirrors every navigation so the user always sees where the agent is.
 *
 *   Layer 2 — Playwright Chromium   (BACKGROUND AUTOMATION)
 *   Headless engine used by the agent for reliable interaction.
 */
export default class BrowserService {
    constructor(mainWindow = null, browserView = null) {
        this.mainWindow = mainWindow;
        this.browserView = browserView;
        this.bgBrowser = null;
        this.bgContext = null;
        this.bgPage = null;
    }

    setMainWindow(window) {
        this.mainWindow = window;
    }

    setBrowserView(view) {
        this.browserView = view;
    }

    getWebContents() {
        if (this.browserView) return this.browserView.webContents;
        if (this.mainWindow) return this.mainWindow.webContents;
        throw new Error('[BrowserService] No webContents available');
    }

    getPage() {
        return this.bgPage || this.getWebContents();
    }

    async _initPlaywright() {
        if (this.bgBrowser) return;
        console.log('[BrowserService] Launching Playwright background browser...');
        this.bgBrowser = await chromium.launch({
            headless: true,
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        });
        this.bgContext = await this.bgBrowser.newContext({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
        });
        this.bgPage = await this.bgContext.newPage();
        console.log('[BrowserService] Playwright ready.');
    }

    _normalizeUrl(url) {
        let normalized = url.trim();
        if (normalized.toLowerCase().startsWith('open ')) {
            normalized = normalized.substring(5).trim();
        }
        if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
            return normalized;
        }
        const hostPart = normalized.split('/')[0];
        if (!hostPart.includes('.')) {
            if (!hostPart.includes(':')) {
                normalized = normalized.replace(hostPart, hostPart + '.com');
            }
        }
        if (!normalized.includes('://')) {
            const host = normalized.split('/')[0];
            if (
                !host.includes('.') &&
                !host.includes('localhost') &&
                !host.includes(':')
            ) {
                normalized =
                    host +
                    '.com' +
                    (normalized.includes('/') ? normalized.substring(host.length) : '');
            }
            normalized = 'https://' + normalized;
        }
        return normalized;
    }

    ensureVisible() {
        if (!this.browserView || !this.mainWindow) return;
        try {
            const { width, height } = this.mainWindow.getContentBounds();
            this.browserView.setBounds({
                x: 0,
                y: TOPBAR_HEIGHT,
                width: Math.max(width, 0),
                height: Math.max(height - TOPBAR_HEIGHT, 0),
            });
            this.mainWindow.setTopBrowserView(this.browserView);
        } catch (e) {
            console.warn('[BrowserService] ensureVisible failed:', e.message);
        }
    }

    async navigate(url, waitForLoad = true) {
        url = this._normalizeUrl(url);
        console.log('[BrowserService] navigate →', url);
        this.ensureVisible();
        const [electronResult] = await Promise.all([
            this._navigateElectron(url, waitForLoad),
            this._navigatePlaywright(url),
        ]);
        return electronResult;
    }

    async _navigateElectron(url, waitForLoad) {
        try {
            const wc = this.getWebContents();
            if (this.mainWindow) {
                this.mainWindow.webContents.send('browser:status-update', {
                    url,
                    title: 'Loading...',
                    isLoading: true,
                    canGoBack: wc.canGoBack(),
                    canGoForward: wc.canGoForward(),
                });
            }
            await wc.loadURL(url).catch((err) => {
                console.warn(
                    '[BrowserService] BrowserView loadURL warning:',
                    err.message
                );
            });
            if (waitForLoad) {
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.warn(
                            '[BrowserService] BrowserView load timeout (non-fatal) —',
                            url
                        );
                        resolve();
                    }, 15000);
                    wc.once('did-finish-load', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    wc.once('did-fail-load', (event, errorCode, errorDescription) => {
                        clearTimeout(timeout);
                        console.warn(
                            `[BrowserService] BrowserView load failed (${errorCode}): ${errorDescription}`
                        );
                        resolve();
                    });
                });
            }
            if (this.mainWindow) {
                this.mainWindow.webContents.send('browser:status-update', {
                    url: wc.getURL(),
                    title: wc.getTitle(),
                    isLoading: false,
                    canGoBack: wc.canGoBack(),
                    canGoForward: wc.canGoForward(),
                });
            }
            return { success: true, url: wc.getURL(), title: wc.getTitle() };
        } catch (error) {
            console.warn(
                '[BrowserService] BrowserView error (non-fatal):',
                error.message
            );
            return { success: true, url, title: '' };
        }
    }

    async _navigatePlaywright(url) {
        try {
            await this._initPlaywright();
            await this.bgPage.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            console.log('[BrowserService] Playwright mirrored:', url);
        } catch (error) {
            console.warn(
                '[BrowserService] Playwright mirror warning:',
                error.message
            );
        }
    }

    async goBack() {
        const wc = this.getWebContents();
        if (wc.canGoBack()) {
            wc.goBack();
            return { success: true };
        }
        return { success: false, error: 'Cannot go back' };
    }

    async goForward() {
        const wc = this.getWebContents();
        if (wc.canGoForward()) {
            wc.goForward();
            return { success: true };
        }
        return { success: false, error: 'Cannot go forward' };
    }

    async reload() {
        this.getWebContents().reload();
        return { success: true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERACTION
    // ─────────────────────────────────────────────────────────────────────────

    async extractCleanContent() {
        try {
            console.log('[BrowserService] Extracting high-fidelity content...');
            const wc = this.getWebContents();

            const extractionScript = `
        (() => {
          const getFinancialData = () => {
            const selectors = [
              '.priceValue', '[class*="priceText"]', '[class*="price-value"]', 
              '[data-field="regularMarketPrice"]', '[data-last-price]',
              '.YMlS7e', '.fxs_price_live', '[class*="quote-header"]',
              '#quote-header-info', '.price-container', '[class*="current-price"]'
            ];
            let found = "";
            selectors.forEach(s => {
              const el = document.querySelector(s);
              if (el && el.innerText.trim()) {
                found += "[MARKET DATA (" + s + ")]: " + el.innerText.trim() + "\\n";
              }
            });
            return found;
          };

          const cleanText = (el) => {
            if (!el) return "";
            const clone = el.cloneNode(true);
            const noisy = clone.querySelectorAll('nav, footer, script, style, .ad, .ads, .popup, #header, #footer, .nav-container');
            noise.forEach(n => n.remove());
            return clone.innerText.trim();
          };

          const financial = getFinancialData();
          const main = document.querySelector('article, main, #main-content, .main') || document.body;
          const body = cleanText(main);
          return (financial ? financial + "\\n--- CONTENTS ---\\n" : "") + body;
        })()
      `;

            let content = '';
            let retries = 0;

            while (retries < 4 && content.length < 800) {
                if (retries > 0) {
                    console.log(
                        `[BrowserService] Extraction retry ${retries} (Current length: ${content.length})...`
                    );
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }

                content = await wc.executeJavaScript(extractionScript).catch(() => '');

                if ((!content || content.length < 500) && this.bgPage) {
                    content = await this.bgPage.evaluate(extractionScript).catch(() => '');
                }

                retries++;
                if (content && content.includes('[MARKET DATA')) break;
            }

            console.log(`[BrowserService] Extraction complete (${content.length} chars)`);
            return {
                success: true,
                textContent: content,
                text: content,
            };
        } catch (error) {
            console.error('[BrowserService] Critical extraction failure:', error);
            return { success: false, error: error.message };
        }
    }

    async clickElement(selectorOrDescription) {
        try {
            console.log(`[BrowserService] clicking: ${selectorOrDescription}`);
            const wc = this.getWebContents();

            const safeDescription = selectorOrDescription
                .replace(/"/g, '\\"')
                .replace(/'/g, "\\'");

            const isUnsafe = await wc
                .executeJavaScript(
                    `
        (() => {
          const text = "${safeDescription}";
          const xpath = "//*[(self::a or self::button) and contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '" + text.toLowerCase() + "')]";
          const el = document.evaluate(xpath, document, null, 9, null).singleNodeValue;
          if (!el) return false;
          const href = el.href || '';
          return ['/p/', '/product/', '/item/', 'adurl'].some(p => href.includes(p));
        })()
      `
                )
                .catch(() => false);

            if (isUnsafe) {
                console.warn(
                    '[BrowserService] Action Guard: Blocking potentially unsafe click.'
                );
                return { success: false, error: 'Action Guard Blocked' };
            }

            await wc
                .executeJavaScript(
                    `
        (() => {
          const text = "${safeDescription.toLowerCase()}";
          const findEl = () => {
            const interactiveXPath = "//*[(self::a or self::button or @role='button' or @role='link') and contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '" + text + "')]";
            const interactive = document.evaluate(interactiveXPath, document, null, 9, null).singleNodeValue;
            if (interactive) return interactive;

            const generalXPath = "//*[(self::span or self::label or self::p or self::h1 or self::h2 or self::h3 or self::div) and contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '" + text + "')]";
            const general = document.evaluate(generalXPath, document, null, 9, null).singleNodeValue;
            if (general) return general;

            return document.querySelector('[aria-label*="' + text + '" i], [title*="' + text + '" i], [id*="' + text + '" i]');
          };

          const el = findEl();
          if (el) {
            const target = el.closest('a') || el.closest('button') || el;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.style.outline = '4px solid #3b82f6';
            target.style.outlineOffset = '2px';
            setTimeout(() => {
              target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              target.click();
            }, 500);
            setTimeout(() => { target.style.outline = ''; }, 1500);
            return true;
          }
          return false;
        })()
      `
                )
                .catch(() => { });

            if (this.bgPage) {
                await Promise.any([
                    this.bgPage
                        .getByRole('link', { name: selectorOrDescription, exact: false })
                        .click({ timeout: 2000 }),
                    this.bgPage
                        .getByRole('button', { name: selectorOrDescription, exact: false })
                        .click({ timeout: 2000 }),
                    this.bgPage
                        .getByText(selectorOrDescription, { exact: false })
                        .first()
                        .click({ timeout: 2000 }),
                    this.bgPage.click(`[aria-label*="${selectorOrDescription}" i]`, {
                        timeout: 2000,
                    }),
                ]).catch(() => { });
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async fillForm(fields, submit = false) {
        try {
            console.log('[BrowserService] filling form:', fields);
            const wc = this.getWebContents();

            for (const [key, value] of Object.entries(fields)) {
                const safeVal = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
                const safeKey = key.replace(/"/g, '\\"').replace(/'/g, "\\'");

                await wc
                    .executeJavaScript(
                        `
          (() => {
            const target = "${safeKey}".toLowerCase();
            const val = "${safeVal}";
            const findInput = () => {
              const q = (s) => document.querySelector(s);
              return q('#' + target) || 
                     q('input[name="' + target + '"]') ||
                     q('input#search') || q('input[name="search"]') || 
                     q('input[placeholder*="' + target + '" i]') ||
                     q('input[aria-label*="' + target + '" i]') || 
                     q('input[type="search"]') || 
                     q('input[type="text"]');
            };

            const el = findInput();
            if (el) { 
              el.focus();
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.4)';
              setTimeout(() => { el.style.boxShadow = ''; }, 2000);
              return true;
            }
            return false;
          })()
        `
                    )
                    .catch(() => { });

                if (this.bgPage) {
                    await Promise.any([
                        this.bgPage.fill(`#${key}`, value, { timeout: 1500 }),
                        this.bgPage.fill(`input[name="${key}"]`, value, { timeout: 1500 }),
                        this.bgPage
                            .locator('input[type="search"]')
                            .fill(value, { timeout: 1500 }),
                        this.bgPage
                            .locator('input[type="text"]')
                            .first()
                            .fill(value, { timeout: 1500 }),
                    ]).catch(() => { });
                }
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async scroll(direction = 'down', amount = 500) {
        const pixels = direction === 'down' ? amount : -amount;
        console.log(`[BrowserService] scrolling ${direction} ${amount}px`);
        await this.getWebContents()
            .executeJavaScript(`window.scrollBy({ top: ${pixels}, behavior: 'smooth' })`)
            .catch(() => { });
        if (this.bgPage) {
            await this.bgPage
                .evaluate((px) => window.scrollBy(0, px), pixels)
                .catch(() => { });
        }
        return { success: true };
    }

    async captureScreenshot() {
        if (this.bgPage) {
            try {
                const buffer = await this.bgPage.screenshot({ fullPage: false });
                return { success: true, screenshot: buffer.toString('base64') };
            } catch { }
        }
        const image = await this.getWebContents().capturePage();
        return { success: true, screenshot: image.toPNG().toString('base64') };
    }

    async pressEnter() {
        console.log('[BrowserService] pressing Enter');
        const wc = this.getWebContents();
        await wc
            .executeJavaScript(
                `
      (() => {
        const el = document.activeElement;
        if (!el) return 'no-active-element';
        const events = ['keydown', 'keypress', 'keyup'];
        events.forEach(type => {
          const ev = new KeyboardEvent(type, {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
          });
          el.dispatchEvent(ev);
        });
        if (el.form) el.form.submit();
        const btn = document.querySelector('input[type="submit"], button[type="submit"], [class*="search-button"], #nav-search-submit-button');
        if (btn) btn.click();
        return 'executed';
      })()
    `
            )
            .catch(() => { });
        await wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
        await wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
        if (this.bgPage) {
            await this.bgPage.keyboard.press('Enter').catch(() => { });
        }
        return { success: true };
    }

    async wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async close() {
        if (this.bgBrowser) {
            await this.bgBrowser.close();
            this.bgBrowser = null;
            this.bgContext = null;
            this.bgPage = null;
        }
    }
}
