
// Simulate an AI service - replace this with actual API calls (OpenAI, Anthropic, etc.)
export const streamResponse = async (prompt, onChunk) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const content = `That's a great question about "${prompt}". As an AI agent integrated into Aeon, I can help you browse the web more effectively.
  
Here are a few things I can do:
1. Summarize the current page content.
2. Find related information across multiple tabs.
3. Automate repetitive browsing tasks.

Is there anything specific you'd like me to analyze on this page?`;

    const words = content.split(' ');

    // Simulate streaming word by word
    for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + ' ';
        onChunk(chunk);
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50)); // Random typing speed
    }
};
