# VeriBrowse - Agentic Browser Architecture

## Overview

VeriBrowse is an **Orchestrator-Centric Agentic Browser** built with Electron, featuring AI-powered browsing automation, intelligent content extraction, and memory-based learning.

### Core Architecture Principle

**ORCHESTRATOR-CENTRIC DESIGN**: The Orchestrator is the central decision-making system, while AI models, browser automation, and storage act as interchangeable tools.

```
User Input
   ↓
Orchestrator (Decision Layer)
   ↓
Tool Layer (Browser, Crawler, Search, Memory, AI)
   ↓
Response
```

---

## System Architecture

### Layer Structure

```
┌─────────────────────────────────────────┐
│         Electron UI (Renderer)          │
│    React + Next.js + Tailwind CSS       │
└─────────────────┬───────────────────────┘
                  │ IPC Communication
┌─────────────────▼───────────────────────┐
│       Main Process (background.js)       │
│         IPC Handlers & Window Mgmt       │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      ORCHESTRATOR (Decision Layer)       │
│     Intent Detection & Task Routing      │
└─────────────────┬───────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼──────┐         ┌─────▼──────┐
│ Tool Layer │         │ AI Layer   │
└─────┬──────┘         └─────┬──────┘
      │                       │
┌─────▼──────────────────────▼──────┐
│        Storage Layer                │
│  History DB + Memory + Reports      │
└─────────────────────────────────────┘
```

---

## Core Components

### 1. Orchestrator (`services/Orchestrator.js`)

**THE BRAIN** - Central decision-making and workflow coordination.

#### Responsibilities:
- **Intent Detection**: Analyze user input and classify task type
- **Task Routing**: Route to appropriate tools based on intent
- **Workflow Orchestration**: Coordinate multi-step operations
- **Tool Coordination**: Manage interactions between services

#### Supported Intents:
| Intent | Trigger Keywords | Action |
|--------|------------------|--------|
| `navigate` | URLs, "open", "go to", "visit" | Direct browser navigation |
| `search` | "search", "find", "google", "look for" | Web search |
| `summarize` | "summarize", "tldr", "summary" | Page summarization |
| `report` | "generate report", "create report", "export" | Document generation |
| `question` | "what", "who", "why", "how" | AI Q&A |
| `research` | "research", "explore", "investigate" | Multi-angle research |
| `extract` | "extract", "get", "fetch", "scrape" | Data extraction |

#### Usage Example:
```javascript
const orchestrator = new Orchestrator(mainWindow);
orchestrator.setProgressCallback((progress) => {
  console.log(progress);
});

const result = await orchestrator.executeMission(
  "summarize this page",
  webContents
);
```

---

### 2. CrawlerService (`services/CrawlerService.js`)

**THE EXTRACTOR** - Intelligent page content extraction for AI processing.

#### Capabilities:
- Extract clean text content
- Parse page metadata (title, description, keywords)
- Extract structured data (headings, main content)
- Extract links and references
- Format content for AI consumption

#### Methods:
```javascript
// Extract complete page data
const pageData = await crawlerService.extractPageData(webContents);
// Returns: { url, title, content, links, metadata, structuredData }

// Get clean content for summarization
const cleanContent = await crawlerService.getCleanContent(webContents);

// Extract specific elements
const links = await crawlerService.extractLinks(webContents);
const metadata = await crawlerService.extractMetadata(webContents);
```

#### IPC Handlers:
```javascript
// Frontend usage
const pageData = await window.ipc.invoke('crawler:extract', { tabId });
const content = await window.ipc.invoke('crawler:getCleanContent', { tabId });
```

---

### 3. SearchService (`services/SearchService.js`)

**THE PLANNER** - Intelligent search query generation and analysis.

#### Capabilities:
- Analyze query complexity (simple, moderate, research)
- Generate smart multi-angle queries
- Extract user intent
- Support multiple search engines
- URL detection and normalization

#### Query Types:
| Type | Example | Action |
|------|---------|--------|
| URL | `https://example.com` | Direct navigation |
| Domain | `example.com` | Navigate to https://example.com |
| Simple | `what is AI` | Single search query |
| Moderate | `best practices for X` | 2 search queries |
| Research | `how to build agentic browser` | 4 multi-angle queries |

#### Methods:
```javascript
// Analyze query complexity
const analysis = searchService.analyzeQuery("how to build agentic browser");
// Returns: { type: 'research', count: 4, queries: [...] }

// Build smart queries
const result = searchService.buildSmartQueries(prompt);

// Extract intent
const intent = searchService.extractIntent("search for AI tools");
// Returns: { intent: 'search', query: 'AI tools' }
```

---

### 4. ReportGenerator (`services/ReportGenerator.js`)

**THE DOCUMENTER** - Generate formatted reports from content.

#### Supported Formats:
- **Plain Text** (`.txt`) - Simple readable format
- **Markdown** (`.md`) - Structured format with links
- **HTML** (`.html`) - Styled web format

#### Methods:
```javascript
// Generate custom report
const result = await reportGenerator.generateReport({
  content: 'Report content...',
  title: 'My Report',
  format: 'md',
  metadata: { url: 'https://example.com' }
});

// Generate summary report from crawled data
const result = await reportGenerator.generateSummaryReport(
  crawledData,
  aiSummary,
  'md'
);

// List all reports
const reports = reportGenerator.getReports();

// Delete report
reportGenerator.deleteReport('report_filename.md');
```

#### IPC Handlers:
```javascript
// Generate report
const result = await window.ipc.invoke('report:generate', { options });

// Generate summary report
const result = await window.ipc.invoke('report:generateSummary', {
  tabId,
  summary: 'AI generated summary...',
  format: 'md'
});

// List reports
const { reports } = await window.ipc.invoke('report:list');
```

---

### 5. MemoryService (`services/MemoryService.js`)

**THE MEMORY** - Long-term memory and context storage for RAG.

#### Storage Structure:
```json
{
  "interactions": [],    // User interactions & AI responses
  "summaries": [],       // Page summaries
  "insights": [],        // Learned patterns & insights
  "preferences": {},     // User preferences
  "metadata": {}         // System metadata
}
```

#### Capabilities:
- Store interactions, summaries, and insights
- Search and retrieve relevant context
- RAG (Retrieval-Augmented Generation) support
- User preferences management
- Export/import functionality

#### Methods:
```javascript
// Store interaction
memoryService.storeInteraction({
  type: 'search',
  prompt: 'user query',
  response: 'AI response',
  url: 'https://example.com'
});

// Store summary
memoryService.storeSummary({
  url: 'https://example.com',
  title: 'Page Title',
  content: 'Summary content...',
  tags: ['ai', 'browser']
});

// Get relevant context for RAG
const context = memoryService.getRelevantContext('user query', 5);
// Returns: { interactions: [], summaries: [], insights: [] }

// Search
const results = memoryService.searchSummaries('AI browser', 10);

// Preferences
memoryService.setPreference('theme', 'dark');
const theme = memoryService.getPreference('theme', 'light');

// Stats
const stats = memoryService.getStats();
```

---

### 6. AiService (`services/AiService.js`)

**THE BRAIN** - AI model integration (Gemini + Ollama).

#### Supported Models:
- **Google Gemini** (gemini-1.5-flash) - Cloud-based
- **Ollama** (llama3, phi3, mistral) - Local models

#### Methods:
```javascript
// Run AI task
const result = await aiService.runAgentTask(
  'summarization',
  'Summarize this content...',
  'optional context'
);
// Returns: { success: true, answer: '...' }

// Health check
const health = await aiService.healthCheck();
// Returns: { gemini: true/false, ollama: true/false }
```

---

## Task Execution Workflows

### Workflow 1: Navigation
```
User: "open youtube.com"
  ↓
Orchestrator → Detect: navigate intent
  ↓
AutomationService → Navigate to URL
  ↓
Response: Navigation complete
```

### Workflow 2: Summarization
```
User: "summarize this page"
  ↓
Orchestrator → Detect: summarize intent
  ↓
CrawlerService → Extract page content
  ↓
AiService → Generate summary
  ↓
MemoryService → Store summary
  ↓
Response: Summary shown to user
```

### Workflow 3: Report Generation
```
User: "create report"
  ↓
Orchestrator → Detect: report intent
  ↓
CrawlerService → Extract page data
  ↓
AiService → Generate enhanced content
  ↓
ReportGenerator → Save as .md/.txt/.html
  ↓
Response: File saved confirmation
```

### Workflow 4: Research
```
User: "research agentic browsers"
  ↓
Orchestrator → Detect: research intent
  ↓
SearchService → Generate 4 query angles
  ↓
TabManager → Open multiple tabs
  ↓
CrawlerService → Extract from each tab
  ↓
AiService → Synthesize findings
  ↓
Response: Research summary
```

---

## IPC Communication

### Frontend → Backend Pattern

All IPC handlers follow this pattern:
```javascript
// Frontend
const result = await window.ipc.invoke('service:method', { params });

// Backend (background.js)
ipcMain.handle('service:method', async (event, { params }) => {
  // Process request
  return { success: true, data: result };
});
```

### Available IPC Channels

#### Browser Control
- `browser:navigate` - Navigate to URL
- `browser:newTab` - Create new tab
- `browser:closeTab` - Close tab
- `browser:switchTab` - Switch active tab
- `browser:reload` - Reload current tab
- `browser:goBack` / `browser:goForward` - Navigate history
- `browser:screenshot` - Capture screenshot
- `browser:getContent` - Get page content

#### Agent Operations
- `agent:orchestrate` - Execute mission via Orchestrator
- `agent:resume` - Resume incomplete mission
- `agent:context` - Get relevant context for query

#### Automation
- `automation:run` - Smart search & multi-tab research

#### AI
- `ai:answer` - Get AI answer
- `ai:run` - Run specific AI task
- `ai:healthcheck` - Check AI service status

#### Crawler
- `crawler:extract` - Extract page data
- `crawler:getCleanContent` - Get clean text content

#### Search
- `search:analyze` - Analyze query type
- `search:buildQueries` - Build smart queries
- `search:extractIntent` - Extract user intent

#### Reports
- `report:generate` - Generate custom report
- `report:generateSummary` - Generate summary report
- `report:list` - List all reports
- `report:delete` - Delete report
- `report:getDirectory` - Get reports directory path

#### Memory
- `memory:storeInteraction` - Store interaction
- `memory:storeSummary` - Store summary
- `memory:storeInsight` - Store insight
- `memory:getRecentInteractions` - Get recent interactions
- `memory:searchInteractions` - Search interactions
- `memory:searchSummaries` - Search summaries
- `memory:getRelevantContext` - Get RAG context
- `memory:setPreference` - Set preference
- `memory:getPreference` - Get preference
- `memory:getAllPreferences` - Get all preferences
- `memory:clear` - Clear memory
- `memory:stats` - Get memory statistics
- `memory:export` - Export memory
- `memory:import` - Import memory

#### History
- `history:get` - Get browsing history
- `history:search` - Search history
- `history:clear` - Clear history

#### Database
- `db:stats` - Get database statistics
- `db:cleanup` - Cleanup old entries
- `db:export` - Export database
- `db:backup` - Backup database
- `db:optimize` - Optimize database

---

## Storage Layer

### File Structure
```
userData/
├── history.db           # SQLite database (HistoryService)
├── storage/
│   └── memory.json     # Long-term memory (MemoryService)
├── reports/            # Generated reports
│   ├── report_1.md
│   └── report_2.html
└── exports/            # Exported data
```

---

## Environment Setup

### Required Environment Variables

Create `.env` file in project root:

```env
# AI Services
GEMINI_API_KEY=your_gemini_api_key_here

# Ollama (runs locally on default port)
# No configuration needed
```

### Ollama Setup

1. Install Ollama: https://ollama.ai
2. Pull models:
```bash
ollama pull llama3
ollama pull phi3
ollama pull mistral
```
3. Start Ollama server (runs on http://localhost:11434)

---

## Development

### Start Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Project Structure
```
veribrowse/
├── main/
│   ├── background.js           # Main process
│   ├── preload.js             # Preload script
│   ├── services/              # Core services
│   │   ├── Orchestrator.js    # Central orchestrator
│   │   ├── AiService.js       # AI integration
│   │   ├── CrawlerService.js  # Content extraction
│   │   ├── SearchService.js   # Search intelligence
│   │   ├── ReportGenerator.js # Document generation
│   │   ├── MemoryService.js   # Memory storage
│   │   ├── AutomationService.js
│   │   ├── HistoryService.js
│   │   ├── MissionTracker.js
│   │   └── DatabaseManager.js
│   └── helpers/               # Helper utilities
│       ├── TabManager.js
│       ├── DownloadManager.js
│       └── ...
└── renderer/                   # React frontend
    ├── components/
    ├── pages/
    └── styles/
```

---

## Usage Examples

### Example 1: Simple Navigation
```javascript
// User types: "open youtube.com"
const result = await window.ipc.invoke('agent:orchestrate', {
  prompt: 'open youtube.com',
  tabId: currentTabId
});
// Navigates directly to YouTube
```

### Example 2: Page Summarization
```javascript
// User clicks "Summarize" button
const result = await window.ipc.invoke('agent:orchestrate', {
  prompt: 'summarize this page',
  tabId: currentTabId
});
// Returns AI-generated summary
```

### Example 3: Research Task
```javascript
// User types: "research agentic browser architecture"
const result = await window.ipc.invoke('automation:run', {
  prompt: 'research agentic browser architecture'
});
// Opens 4 tabs with different search angles
// All tabs displayed in grid layout
```

### Example 4: Generate Report
```javascript
// User clicks "Generate Report"
const result = await window.ipc.invoke('report:generateSummary', {
  tabId: currentTabId,
  summary: 'Page summary content...',
  format: 'md'
});
// Saves report to reports/ directory
```

---

## Model Independence

The architecture is **model-agnostic**. AI models can be swapped without changing the Orchestrator or other services.

### Current Models:
- Gemini (Cloud)
- Ollama/Llama3 (Local)

### How to Add New Models:

Edit `services/AiService.js`:
```javascript
async runAgentTask(type, prompt, context = "") {
  // Add your model here
  if (this.yourModel) {
    const response = await this.yourModel.generate(prompt);
    return { success: true, answer: response };
  }
  // ... existing models
}
```

---

## Future Enhancements

### Planned Features:
- [ ] Multi-tab orchestration for research tasks
- [ ] Visual selector for element extraction
- [ ] Browser action recording & playback
- [ ] Advanced RAG with vector embeddings
- [ ] Mission resumption & continuation
- [ ] Collaborative browsing sessions
- [ ] Plugin system for custom tools

---

## Architecture Benefits

✅ **Orchestrator-Centric**: Single source of truth for decision-making  
✅ **Model Independent**: Easy to swap AI providers  
✅ **Tool-Based**: Modular services that can be used independently  
✅ **Scalable**: Easy to add new intents and tools  
✅ **Memory-Enabled**: RAG support for context-aware responses  
✅ **Multi-Format**: Support for various output formats  

---

## Contributing

When adding new features:

1. **Add to Tool Layer** - Create service in `services/`
2. **Integrate with Orchestrator** - Add intent detection
3. **Add IPC Handlers** - Expose via IPC in `background.js`
4. **Update UI** - Add frontend controls in `renderer/`
5. **Document** - Update this architecture guide

---

## Support

For issues and questions:
- Check the implementation.md file
- Review service documentation in code comments
- Test services via IPC handlers

---

**Built with ❤️ using Electron + React + AI**
