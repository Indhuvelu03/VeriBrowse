import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import * as CreditGuard from '../../core/CreditGuard.js';

export async function execute(page, params) {
    const { topic, content } = params;

    // Generate a clean markdown document from the LLM based on extracted content
    const prompt = `
Generate a structured, professional markdown report about "${topic}" based on the following raw content extracted from the web:

--- RAW CONTENT ---
${content.slice(0, 15000)} // Ensure we don't blow context limit completely
--- END RAW CONTENT ---

The report should have:
- An H1 Title
- A brief executive summary (1 paragraph)
- Key findings with bullet points
- Use H2 and H3 for sections where appropriate.
    `.trim();

    try {
        const reportMd = await CreditGuard.generate(prompt);

        // Save to downloads directory
        const downloadsPath = app.getPath('downloads');
        const filename = `VeriBrowse_Report_${topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        const fullPath = path.join(downloadsPath, filename);

        fs.writeFileSync(fullPath, reportMd, 'utf8');

        return {
            success: true,
            needsHuman: false,
            result: `Report generated successfully and saved to ${fullPath}`,
            isScreenshot: false,
            data: reportMd
        };
    } catch (error) {
        console.error('[generateReport] Failed to generate report:', error);
        return {
            success: false,
            needsHuman: false,
            result: null,
            error: error.message
        };
    }
}
