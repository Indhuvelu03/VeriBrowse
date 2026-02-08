# VeriBrowse - Quick Start Guide

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (v16 or higher)
2. **Ollama** (for local AI) - Optional but recommended
   - Install from: https://ollama.ai
   - Pull models: `ollama pull llama3` or `ollama pull phi3`
3. **Gemini API Key** (optional) - For cloud AI

### Installation

```bash
# Install dependencies
npm install

# Set up environment (optional)
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY if using Gemini
```

### Running the Application

```bash
# Development mode
npm run dev

# Build for production
npm run build
```

---

## 🧪 Testing the System

### Open DevTools Console

Press `F12` or `Ctrl+Shift+I` in the app to open DevTools.

### Test 1: Navigation
```javascript
await window.ipc.invoke('agent:orchestrate', {
  prompt: 'open youtube.com'
});
// Should navigate to YouTube
```

### Test 2: Search
```javascript
await window.ipc.invoke('automation:run', {
  prompt: 'research agentic browsers'
});
// Should open 4 tabs with different search angles
```

### Test 3: Page Extraction
```javascript
// Navigate to any website first, then:
const data = await window.ipc.invoke('crawler:extract', {});
console.log('Page data:', data);
```

### Test 4: Summarization
```javascript
// Navigate to a content page first, then:
const result = await window.ipc.invoke('agent:orchestrate', {
  prompt: 'summarize this page'
});
console.log('Summary:', result.summary);
```

### Test 5: Report Generation
```javascript
const report = await window.ipc.invoke('report:generate', {
  options: {
    content: 'This is a test report content.',
    title: 'Test Report',
    format: 'md'
  }
});
console.log('Report saved:', report.fileName);
```

### Test 6: Memory System
```javascript
// Store interaction
await window.ipc.invoke('memory:storeInteraction', {
  interaction: {
    type: 'test',
    prompt: 'test query',
    response: 'test response'
  }
});

// Get stats
const stats = await window.ipc.invoke('memory:stats');
console.log('Memory stats:', stats);
```

### Test 7: AI Service
```javascript
const result = await window.ipc.invoke('ai:answer', {
  prompt: 'What is an agentic browser?'
});
console.log('AI Answer:', result.answer);
```

---

## 📖 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system architecture
- **[USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md)** - Code examples
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - What was built
- **[implementation.md](./implementation.md)** - Original specification

---

## 🎯 Key Features

### 1. Intelligent Intent Detection
The system automatically detects what you want to do:
- "open youtube.com" → Navigate
- "summarize this page" → Summarize
- "research AI agents" → Multi-tab research
- "generate report" → Create document

### 2. Smart Search
Types a complex query and the system will:
- Analyze the complexity
- Generate multiple search angles
- Open relevant tabs
- Extract and synthesize information

### 3. Page Analysis
Extract structured content from any webpage:
- Clean text content
- Headings and structure
- Links and references
- Metadata

### 4. Report Generation
Create formatted documents in:
- Plain text (.txt)
- Markdown (.md)
- HTML (.html)

### 5. Long-term Memory
The system remembers:
- Past interactions
- Page summaries
- Learned insights
- User preferences

---

## 🔧 Configuration

### AI Models

The system supports two AI providers:

#### 1. Gemini (Cloud)
Add to `.env`:
```env
GEMINI_API_KEY=your_api_key_here
```

#### 2. Ollama (Local)
```bash
# Install Ollama
# Download from https://ollama.ai

# Pull models
ollama pull llama3
ollama pull phi3
ollama pull mistral

# Start Ollama (runs automatically on port 11434)
```

The system will automatically use Gemini if API key is available, otherwise falls back to Ollama.

---

## 📁 Data Storage

### Locations

All data is stored in the app's userData directory:

**Windows**: `C:\Users\<username>\AppData\Roaming\my-nextron-app\`
**Mac**: `~/Library/Application Support/my-nextron-app/`
**Linux**: `~/.config/my-nextron-app/`

### Files

```
userData/
├── history.db          # Browsing history (SQLite)
├── storage/
│   └── memory.json    # Long-term memory
├── reports/           # Generated reports
│   ├── *.md
│   ├── *.txt
│   └── *.html
└── exports/           # Exported data
```

---

## 🎨 UI Integration (Next Steps)

The backend is complete. To integrate with UI:

### 1. Add Orchestrator Controls

```javascript
// In your React component
import { useState } from 'react';

function CommandBar() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  
  const handleSubmit = async () => {
    const result = await window.ipc.invoke('agent:orchestrate', {
      prompt: input
    });
    setResult(result);
  };
  
  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSubmit}>Execute</button>
      {result && <div>{result.summary}</div>}
    </div>
  );
}
```

### 2. Show Progress

```javascript
// Listen to progress events
useEffect(() => {
  window.ipc.on('agent:orchestrate-progress', (progress) => {
    console.log(progress.phase, progress.message);
    // Update UI progress indicator
  });
}, []);
```

### 3. Display Reports

```javascript
async function listReports() {
  const { reports } = await window.ipc.invoke('report:list');
  return reports;
}
```

### 4. Memory Browser

```javascript
async function searchMemory(query) {
  const result = await window.ipc.invoke('memory:searchSummaries', {
    query,
    limit: 10
  });
  return result.summaries;
}
```

---

## 🐛 Troubleshooting

### Issue: AI not responding
**Solution**: 
1. Check if Ollama is running: `ollama list`
2. Verify Gemini API key in `.env`
3. Check console for errors

### Issue: Reports not saving
**Solution**: Check file permissions in userData directory

### Issue: Page extraction failing
**Solution**: Some pages block CDP. Try different websites.

### Issue: Memory not persisting
**Solution**: Check userData/storage/ directory exists and is writable

---

## 📊 Performance Tips

1. **Use Ollama for local processing** - Faster and private
2. **Limit research queries** - 4 tabs max for optimal performance
3. **Clear old memory** - Use `memory:clear` periodically
4. **Optimize reports** - Use markdown for smaller file sizes

---

## 🔐 Privacy

- All data stored locally by default
- Ollama runs entirely offline
- Gemini only if you provide API key
- No telemetry or tracking

---

## 🤝 Contributing

To add new features:

1. **Add Service** - Create in `main/services/`
2. **Add IPC Handler** - Update `main/background.js`
3. **Update Orchestrator** - Add intent detection if needed
4. **Document** - Update ARCHITECTURE.md

---

## 📝 Examples Cheat Sheet

```javascript
// Navigation
await window.ipc.invoke('agent:orchestrate', {
  prompt: 'open example.com'
});

// Search
await window.ipc.invoke('automation:run', {
  prompt: 'research topic'
});

// Summarize
await window.ipc.invoke('agent:orchestrate', {
  prompt: 'summarize this page'
});

// Extract
const data = await window.ipc.invoke('crawler:extract', {});

// Generate Report
await window.ipc.invoke('report:generateSummary', {
  tabId: null,
  summary: 'content...',
  format: 'md'
});

// Memory
await window.ipc.invoke('memory:storeInteraction', {
  interaction: { type: 'test', prompt: '...', response: '...' }
});

// AI
await window.ipc.invoke('ai:answer', {
  prompt: 'What is...?'
});
```

---

## ✅ Verification Checklist

- [ ] App starts without errors
- [ ] Can navigate to websites
- [ ] Can extract page content
- [ ] AI responds to questions
- [ ] Can generate reports
- [ ] Memory stores data
- [ ] Search queries work
- [ ] Multi-tab research functions

---

## 🎉 You're Ready!

The system is fully functional. Start exploring the features and building your UI components!

For detailed documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

For code examples, see [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md).

---

**Happy Browsing! 🚀**
