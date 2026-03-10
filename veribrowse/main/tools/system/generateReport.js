const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { dialog } = require('electron');

/**
 * Generates a DOCX research report from the agent's findings.
 * 
 * @param {string} topic - The overall topic of the research.
 * @param {string} content - Markdown-like (or plain text) content of the report.
 * @returns {Promise<string>} The path to the generated DOCX file.
 */
async function generateReport(topic, content) {
    console.log(`[generateReport] Creating DOCX for topic: ${topic}`);

    // Parse simple markdown-ish structure into DOCX elements
    // This is a naive parser. It splits by double newline into paragraphs.
    const blocks = content.split(/\n\n+/);
    
    const docChildren = [
        new Paragraph({
            text: `VeriBrowse Research Report`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
        }),
        new Paragraph({
            text: `Topic: ${topic}`,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
            spacing: { after: 400 },
        }),
        new Paragraph({
            text: `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 400 },
        })
    ];

    for (const block of blocks) {
        const lines = block.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Handle Headings (###)
            let headingLevel = undefined;
            if (line.startsWith('### ')) {
                headingLevel = HeadingLevel.HEADING_3;
                line = line.substring(4);
            } else if (line.startsWith('## ')) {
                headingLevel = HeadingLevel.HEADING_2;
                line = line.substring(3);
            } else if (line.startsWith('# ')) {
                headingLevel = HeadingLevel.HEADING_1;
                line = line.substring(2);
            }

            // Handle Bullet points (-)
            let bullet = undefined;
            if (line.startsWith('- ') || line.startsWith('* ')) {
                bullet = { level: 0 };
                line = line.substring(2);
            }

            // Bold parsing (**text**)
            const boldRegex = /\*\*(.*?)\*\*/g;
            const textRuns = [];
            let lastIndex = 0;
            let match;
            
            while ((match = boldRegex.exec(line)) !== null) {
                // Add text before bold
                if (match.index > lastIndex) {
                    textRuns.push(new TextRun({ text: line.substring(lastIndex, match.index) }));
                }
                // Add bold text
                textRuns.push(new TextRun({ text: match[1], bold: true }));
                lastIndex = boldRegex.lastIndex;
            }
            
            // Add remaining text
            if (lastIndex < line.length) {
                textRuns.push(new TextRun({ text: line.substring(lastIndex) }));
            }

            const pOpts = { children: textRuns };
            if (headingLevel) pOpts.heading = headingLevel;
            if (bullet) pOpts.bullet = bullet;
            
            docChildren.push(new Paragraph(pOpts));
        }
    }

    const doc = new Document({
        sections: [{
            properties: {},
            children: docChildren,
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    
    // Default to Downloads folder
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    // Sanitize filename
    const safeTopic = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
    const filename = `VeriBrowse_Report_${safeTopic}_${Date.now()}.docx`;
    let savePath = path.join(downloadsPath, filename);

    // If running in main process where dialog is available, you could ask the user
    // but for autonomous agent, saving automatically to Downloads is better.
    fs.writeFileSync(savePath, buffer);
    console.log(`[generateReport] DOCX saved to: ${savePath}`);

    return savePath;
}

export default generateReport;
