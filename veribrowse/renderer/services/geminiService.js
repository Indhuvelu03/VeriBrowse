export const generateGeminiResponse = async (prompt) => {
    try {
        console.log("[Gemini Service] Sending IPC request to Main Process...");

        if (typeof window === 'undefined' || !window.ipc || !window.ipc.invoke) {
            throw new Error("Electron IPC not available or 'invoke' method missing.");
        }

        const result = await window.ipc.invoke('gemini-generate', prompt);
        return result;

    } catch (error) {
        console.error("[Gemini Service] API Error:", error);
        throw error;
    }
};
