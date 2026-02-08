function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class AutomationService {
    constructor() {
        this.contentCache = new Map();
    }

    async checkSession(webContents) {
        try {
            if (!webContents || webContents.isDestroyed()) return false;
            if (!webContents.debugger.isAttached()) {
                await this.attach(webContents);
            }
            // Simple ping to verify responsiveness
            await webContents.debugger.sendCommand('Runtime.evaluate', { expression: '1+1' });
            return true;
        } catch (e) {
            console.warn('[AutomationService] Session check failed, re-attaching...', e.message);
            try {
                if (webContents.debugger.isAttached()) webContents.debugger.detach();
            } catch (ignore) { }
            await this.attach(webContents);
            return true;
        }
    }

    async attach(webContents) {
        // Simple attach logic

        if (webContents.debugger.isAttached()) return;
        try {
            webContents.debugger.attach('1.3');
        } catch (err) {
            console.error('[AutomationService] Failed to attach:', err);
            throw err;
        }
        await webContents.debugger.sendCommand('Page.enable');
        await webContents.debugger.sendCommand('DOM.enable');
        await webContents.debugger.sendCommand('Runtime.enable');
        console.log(`[AutomationService] Attached to webContents ${webContents.id}`);
    }

    async detach(webContents) {
        try {
            if (webContents.debugger.isAttached()) {
                webContents.debugger.detach();
            }
        } catch (err) {
            console.error('[AutomationService] Failed to detach:', err);
        }
    }

    async navigate(webContents, url) {
        if (!await this.checkSession(webContents)) return;
        return this.sendCommand(webContents, 'Page.navigate', { url });
    }

    /** Get page HTML via CDP. Falls back to body text for summarization if DOM API fails or is too large. */
    async getDOM(webContents) {
        if (!await this.checkSession(webContents)) return '';

        try {
            const { root } = await this.sendCommand(webContents, 'DOM.getDocument', { depth: 2 });
            const { outerHTML } = await this.sendCommand(webContents, 'DOM.getOuterHTML', { nodeId: root.nodeId });
            if (outerHTML && outerHTML.length < 800000) return outerHTML;
        } catch (e) {
            console.warn('[AutomationService] getDOM (CDP) failed, using getTextContent:', e?.message);
        }

        const text = await this.getTextContent(webContents);
        return text ? `<html><head><title>Page</title></head><body><pre>${escapeHtml(text)}</pre></body></html>` : '';
    }

    /** Reliable text extraction for AI summarization (works when DOM.getOuterHTML fails). */
    async getTextContent(webContents) {
        if (!await this.checkSession(webContents)) return '';

        const currentUrl = webContents.getURL();
        const cached = this.contentCache.get(webContents.id);

        if (cached && cached.url === currentUrl && (Date.now() - cached.timestamp < 60000)) {
            // console.log('[AutomationService] Serving cached content');
            return cached.content;
        }

        try {
            const { result } = await this.sendCommand(webContents, 'Runtime.evaluate', {
                expression: `(function(){ try { var b = document.body; if(!b) return ''; var t = document.title || ''; return (t ? t + '\\n\\n' : '') + b.innerText; } catch(e){ return ''; } })()`,
                returnByValue: true,
            });
            const text = (result?.value != null ? String(result.value) : '').slice(0, 300000);

            this.contentCache.set(webContents.id, {
                url: currentUrl,
                content: text,
                timestamp: Date.now()
            });

            return text;
        } catch (e) {
            console.warn('[AutomationService] getTextContent failed:', e?.message);
            return '';
        }
    }

    async ensureAttached(webContents) {
        if (webContents.debugger.isAttached()) return;
        await this.attach(webContents);
        if (!webContents.debugger.isAttached()) {
            throw new Error('Could not attach debugger to tab');
        }
    }

    async type(webContents, text) {
        if (!await this.checkSession(webContents)) return;
        for (const char of text) {
            await this.sendCommand(webContents, 'Input.dispatchKeyEvent', {
                type: 'keyDown',
                text: char,
                unmodifiedText: char,
                key: char, // Simplified
            });
            await this.sendCommand(webContents, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                text: char,
                unmodifiedText: char,
                key: char,
            });
        }
    }

    async click(webContents, selector) {
        if (!await this.checkSession(webContents)) return;
        // 1. Get Node ID
        const { root } = await this.sendCommand(webContents, 'DOM.getDocument');
        const { nodeId } = await this.sendCommand(webContents, 'DOM.querySelector', {
            nodeId: root.nodeId,
            selector: selector,
        });

        if (!nodeId) throw new Error(`Element not found: ${selector}`);

        // 2. Get Box Model (Coordinates)
        const { model } = await this.sendCommand(webContents, 'DOM.getBoxModel', { nodeId });
        const x = model.content[0] + (model.width / 2);
        const y = model.content[1] + (model.height / 2);

        // 3. Dispatch Click
        await this.sendCommand(webContents, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });
        await this.sendCommand(webContents, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });
    }

    async sendCommand(webContents, method, params = {}) {
        await this.ensureAttached(webContents);
        return webContents.debugger.sendCommand(method, params);
    }

    async captureScreenshot(webContents) {
        if (!await this.checkSession(webContents)) return null;
        const { data } = await this.sendCommand(webContents, 'Page.captureScreenshot', { format: 'jpeg', quality: 80 });
        return data; // Base64 string
    }
}

export default new AutomationService();
