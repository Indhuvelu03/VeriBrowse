/**
 * getAllTabs.js
 * 
 * Returns a list of all active User and Shadow tabs.
 * ZERO LLM calls.
 */

export default async function getAllTabs() {
    try {
        const userTabs = [];
        const shadowTabs = [];

        // 1. Process User Tabs
        for (const [id, entry] of global.userTabsMap.entries()) {
            const { playwrightPage } = entry;
            userTabs.push({
                id,
                url: playwrightPage.url(),
                title: await playwrightPage.title(),
                type: 'user'
            });
        }

        // 2. Process Shadow Tabs
        for (const [id, entry] of global.shadowTabsMap.entries()) {
            const { playwrightPage } = entry;
            shadowTabs.push({
                id,
                url: playwrightPage.url(),
                title: await playwrightPage.title(),
                type: 'shadow'
            });
        }

        return {
            success: true,
            result: { userTabs, shadowTabs },
            error: null
        };
    } catch (err) {
        console.error(`[Tool:GetAllTabs] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message
        };
    }
}
