export const generateGeminiResponse = async (prompt, mode = 'auto') => {
    try {
        console.log("[Gemini Service] Sending message to Agent Intelligence...");

        if (typeof window === 'undefined' || !window.ipc || !window.ipc.invoke) {
            throw new Error("Electron IPC not available.");
        }

        // Call the new agentic loop
        const result = await window.ipc.invoke('agent:chat', { message: prompt, mode });

        if (!result.success) {
            throw new Error(result.error || "AI Agent failed to respond.");
        }

        // Return the synthesized text response
        return result.response;

    } catch (error) {
        console.error("[Gemini Service] Agent Error:", error);
        throw error;
    }
};
