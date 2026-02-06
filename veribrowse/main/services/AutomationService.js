import { debugger as electronDebugger } from 'electron';

export class AutomationService {
    constructor() {
        this.attachedTargets = new Map();
    }

    async attach(webContents) {
        try {
            if (webContents.debugger.isAttached()) {
                return;
            }
            webContents.debugger.attach('1.3');
            this.attachedTargets.set(webContents.id, webContents);
            await webContents.debugger.sendCommand('Page.enable');
            await webContents.debugger.sendCommand('DOM.enable');
            await webContents.debugger.sendCommand('Runtime.enable');
            console.log(`[AutomationService] Attached to webContents ${webContents.id}`);
        } catch (err) {
            console.error('[AutomationService] Failed to attach:', err);
        }
    }

    async detach(webContents) {
        try {
            if (webContents.debugger.isAttached()) {
                webContents.debugger.detach();
            }
            this.attachedTargets.delete(webContents.id);
        } catch (err) {
            console.error('[AutomationService] Failed to detach:', err);
        }
    }

    async navigate(webContents, url) {
        return this.sendCommand(webContents, 'Page.navigate', { url });
    }

    async getDOM(webContents) {
        const { root } = await this.sendCommand(webContents, 'DOM.getDocument', { depth: -1 });
        const { outerHTML } = await this.sendCommand(webContents, 'DOM.getOuterHTML', { nodeId: root.nodeId });
        return outerHTML;
    }

    async type(webContents, text) {
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
        if (!webContents.debugger.isAttached()) {
            // Attempt auto-attach
            await this.attach(webContents);
        }
        return webContents.debugger.sendCommand(method, params);
    }
}

export default new AutomationService();
