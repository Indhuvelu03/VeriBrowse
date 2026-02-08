# VeriBrowse Usage Examples

This file contains practical examples of using the VeriBrowse Agent services.

---

## 1. Using the Orchestrator (Main Entry Point)

The Orchestrator automatically detects intent and routes to appropriate services.

### Frontend Usage (React Component)

```javascript
import { useState } from 'react';

function AgentInterface() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const runAgent = async (userPrompt) => {
    setLoading(true);
    
    try {
      const result = await window.ipc.invoke('agent:orchestrate', {
        prompt: userPrompt,
        tabId: null // Or pass specific tabId
      });
      
      setResult(result);
      console.log('Agent result:', result);
    } catch (error) {
      console.error('Agent error:', error);
    }
    
    setLoading(false);
  };
  
  return (
    <div>
      <button onClick={() => runAgent('summarize this page')}>
        Summarize Page
      </button>
      <button onClick={() => runAgent('open youtube.com')}>
        Open YouTube
      </button>
      <button onClick={() => runAgent('research AI agents')}>
        Research AI Agents
      </button>
      
      {loading && <p>Processing...</p>}
      {result && <div>{result.summary}</div>}
    </div>
  );
}
```

---

## 2. Page Content Extraction

Extract clean content from any webpage for AI processing.

### Get Complete Page Data

```javascript
async function extractPageInfo(tabId) {
  const result = await window.ipc.invoke('crawler:extract', { tabId });
  
  if (result.success) {
    console.log('URL:', result.url);
    console.log('Title:', result.title);
    console.log('Content:', result.content);
    console.log('Links:', result.links);
    console.log('Metadata:', result.metadata);
    console.log('Structured Data:', result.structuredData);
  }
  
  return result;
}
```

### Get Clean Content for Summarization

```javascript
async function getPageContent(tabId) {
  const result = await window.ipc.invoke('crawler:getCleanContent', { tabId });
  
  if (result.success) {
    // Clean content ready for AI
    console.log(result.content);
  }
  
  return result;
}
```

---

## 3. Smart Search

Analyze queries and generate intelligent search strategies.

### Analyze Query Complexity

```javascript
async function analyzeUserQuery(userInput) {
  const result = await window.ipc.invoke('search:analyze', {
    prompt: userInput
  });
  
  console.log('Query type:', result.analysis.type);
  console.log('Tab count:', result.analysis.count);
  console.log('Queries:', result.analysis.queries);
  
  // Types: 'simple', 'moderate', 'research', 'url', 'domain'
  return result.analysis;
}

// Examples:
// "youtube.com" → { type: 'domain', count: 1 }
// "what is AI" → { type: 'simple', count: 1 }
// "how to build browser" → { type: 'research', count: 4 }
```

### Build Smart Queries

```javascript
async function buildSearchQueries(userInput) {
  const result = await window.ipc.invoke('search:buildQueries', {
    prompt: userInput,
    options: { limit: 3 } // Optional: limit number of queries
  });
  
  result.result.queries.forEach((query, i) => {
    console.log(`Query ${i + 1}:`, query.query);
    console.log(`URL ${i + 1}:`, query.url);
  });
  
  return result;
}
```

### Extract Intent

```javascript
async function getUserIntent(userInput) {
  const result = await window.ipc.invoke('search:extractIntent', {
    prompt: userInput
  });
  
  console.log('Intent:', result.intent.intent);
  console.log('Query:', result.intent.query);
  
  // Intent types: 'search', 'navigate', 'summarize', 'research', 'tutorial'
  return result.intent;
}
```

---

## 4. Report Generation

Generate formatted documents from page content.

### Generate Custom Report

```javascript
async function generateCustomReport() {
  const result = await window.ipc.invoke('report:generate', {
    options: {
      content: 'Your report content here...',
      title: 'My Custom Report',
      format: 'md', // 'txt', 'md', or 'html'
      metadata: {
        url: 'https://example.com',
        author: 'Your Name',
        description: 'Report description'
      },
      includeMetadata: true
    }
  });
  
  if (result.success) {
    console.log('Report saved:', result.fileName);
    console.log('Path:', result.filePath);
  }
  
  return result;
}
```

### Generate Summary Report

```javascript
async function generatePageSummaryReport(tabId, aiSummary) {
  const result = await window.ipc.invoke('report:generateSummary', {
    tabId: tabId,
    summary: aiSummary,
    format: 'md' // 'txt', 'md', or 'html'
  });
  
  if (result.success) {
    console.log('Summary report created:', result.fileName);
    // Opens reports folder automatically
  }
  
  return result;
}
```

### List All Reports

```javascript
async function listReports() {
  const result = await window.ipc.invoke('report:list');
  
  if (result.success) {
    result.reports.forEach(report => {
      console.log('File:', report.fileName);
      console.log('Size:', report.size, 'bytes');
      console.log('Created:', report.created);
    });
  }
  
  return result.reports;
}
```

### Delete Report

```javascript
async function deleteReport(fileName) {
  const result = await window.ipc.invoke('report:delete', { fileName });
  return result.success;
}
```

---

## 5. Memory & Context Management

Store and retrieve browsing context for RAG (Retrieval-Augmented Generation).

### Store Interaction

```javascript
async function saveInteraction(userPrompt, aiResponse, currentUrl) {
  const result = await window.ipc.invoke('memory:storeInteraction', {
    interaction: {
      type: 'question',
      prompt: userPrompt,
      response: aiResponse,
      url: currentUrl
    }
  });
  
  console.log('Interaction saved:', result.entry.id);
  return result;
}
```

### Store Summary

```javascript
async function saveSummary(url, title, summaryContent) {
  const result = await window.ipc.invoke('memory:storeSummary', {
    summary: {
      url: url,
      title: title,
      content: summaryContent,
      tags: ['ai', 'research', 'summary']
    }
  });
  
  console.log('Summary saved:', result.entry.id);
  return result;
}
```

### Get Relevant Context (RAG)

```javascript
async function getContextForQuery(userQuery) {
  const result = await window.ipc.invoke('memory:getRelevantContext', {
    query: userQuery,
    limit: 5
  });
  
  if (result.success) {
    console.log('Relevant interactions:', result.context.interactions);
    console.log('Relevant summaries:', result.context.summaries);
    console.log('Relevant insights:', result.context.insights);
    
    // Use this context to enhance AI prompts
    return result.context;
  }
}
```

### Search History

```javascript
async function searchMemory(query) {
  // Search interactions
  const interactions = await window.ipc.invoke('memory:searchInteractions', {
    query: query,
    limit: 10
  });
  
  // Search summaries
  const summaries = await window.ipc.invoke('memory:searchSummaries', {
    query: query,
    limit: 10
  });
  
  return {
    interactions: interactions.interactions,
    summaries: summaries.summaries
  };
}
```

### User Preferences

```javascript
async function managePreferences() {
  // Set preference
  await window.ipc.invoke('memory:setPreference', {
    key: 'theme',
    value: 'dark'
  });
  
  // Get preference
  const theme = await window.ipc.invoke('memory:getPreference', {
    key: 'theme',
    defaultValue: 'light'
  });
  
  // Get all preferences
  const allPrefs = await window.ipc.invoke('memory:getAllPreferences');
  
  return allPrefs;
}
```

### Memory Statistics

```javascript
async function getMemoryStats() {
  const result = await window.ipc.invoke('memory:stats');
  
  if (result.success) {
    console.log('Interactions:', result.stats.interactions);
    console.log('Summaries:', result.stats.summaries);
    console.log('Insights:', result.stats.insights);
    console.log('Preferences:', result.stats.preferences);
    console.log('File size:', result.stats.fileSize, 'bytes');
  }
  
  return result.stats;
}
```

---

## 6. Complete Workflow Examples

### Example A: Smart Summarization with Report

```javascript
async function summarizeAndReport(tabId) {
  // Step 1: Extract page content
  const pageData = await window.ipc.invoke('crawler:extract', { tabId });
  
  if (!pageData.success) {
    console.error('Failed to extract page');
    return;
  }
  
  // Step 2: Generate AI summary
  const aiResult = await window.ipc.invoke('ai:run', {
    taskType: 'summarization',
    prompt: `Summarize this page:\n\nTitle: ${pageData.title}\n\nContent: ${pageData.content.substring(0, 5000)}`
  });
  
  if (!aiResult.success) {
    console.error('Failed to generate summary');
    return;
  }
  
  // Step 3: Save to memory
  await window.ipc.invoke('memory:storeSummary', {
    summary: {
      url: pageData.url,
      title: pageData.title,
      content: aiResult.answer,
      tags: ['summary', 'ai-generated']
    }
  });
  
  // Step 4: Generate report
  const report = await window.ipc.invoke('report:generateSummary', {
    tabId: tabId,
    summary: aiResult.answer,
    format: 'md'
  });
  
  console.log('Complete! Report saved:', report.fileName);
  
  return {
    summary: aiResult.answer,
    report: report.fileName
  };
}
```

### Example B: Research with Multiple Tabs

```javascript
async function researchTopic(topic) {
  // Step 1: Analyze query and build smart queries
  const searchResult = await window.ipc.invoke('search:buildQueries', {
    prompt: topic
  });
  
  const queries = searchResult.result.queries;
  
  // Step 2: Open multiple tabs
  const tabs = [];
  for (const query of queries) {
    const tab = await window.ipc.invoke('browser:newTab', {
      url: query.url
    });
    tabs.push({ ...tab, query: query.query });
  }
  
  // Step 3: Wait for pages to load
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 4: Extract content from each tab
  const contents = [];
  for (const tab of tabs) {
    const content = await window.ipc.invoke('crawler:getCleanContent', {
      tabId: tab.tabId
    });
    
    if (content.success) {
      contents.push({
        query: tab.query,
        content: content.content.substring(0, 2000)
      });
    }
  }
  
  // Step 5: Synthesize findings with AI
  const synthesisPrompt = `Research summary for: ${topic}\n\nFindings:\n${
    contents.map((c, i) => `\nSource ${i+1} (${c.query}):\n${c.content}`).join('\n')
  }`;
  
  const synthesis = await window.ipc.invoke('ai:run', {
    taskType: 'research',
    prompt: synthesisPrompt
  });
  
  // Step 6: Save insight to memory
  await window.ipc.invoke('memory:storeInsight', {
    insight: {
      topic: topic,
      content: synthesis.answer,
      relevance: 'high'
    }
  });
  
  return {
    queries: queries.map(q => q.query),
    tabs: tabs,
    synthesis: synthesis.answer
  };
}
```

### Example C: Context-Aware Q&A

```javascript
async function askWithContext(question, tabId) {
  // Step 1: Get current page context
  const pageData = await window.ipc.invoke('crawler:extract', { tabId });
  
  // Step 2: Get relevant memory context (RAG)
  const memoryContext = await window.ipc.invoke('memory:getRelevantContext', {
    query: question,
    limit: 3
  });
  
  // Step 3: Build enhanced prompt with context
  let contextPrompt = `Question: ${question}\n\n`;
  
  if (pageData.success) {
    contextPrompt += `Current Page Context:\nTitle: ${pageData.title}\nURL: ${pageData.url}\nContent: ${pageData.content.substring(0, 2000)}\n\n`;
  }
  
  if (memoryContext.context.summaries.length > 0) {
    contextPrompt += `Relevant Past Context:\n`;
    memoryContext.context.summaries.forEach((s, i) => {
      contextPrompt += `${i+1}. ${s.title}: ${s.content.substring(0, 200)}\n`;
    });
  }
  
  // Step 4: Get AI answer
  const answer = await window.ipc.invoke('ai:answer', {
    prompt: contextPrompt
  });
  
  // Step 5: Store interaction
  await window.ipc.invoke('memory:storeInteraction', {
    interaction: {
      type: 'question',
      prompt: question,
      response: answer.answer,
      url: pageData.url
    }
  });
  
  return answer.answer;
}
```

---

## 7. Progress Monitoring

Monitor Orchestrator progress in real-time.

```javascript
// In your main process or preload
ipcRenderer.on('agent:orchestrate-progress', (event, progress) => {
  console.log('Phase:', progress.phase);
  console.log('Message:', progress.message);
  
  // Phases: 'analyzing', 'planning', 'executing', 'done', 'error'
  
  // Update UI progress bar
  updateProgressUI(progress);
});
```

---

## 8. Error Handling

Always handle errors gracefully:

```javascript
async function safeAgentCall(prompt) {
  try {
    const result = await window.ipc.invoke('agent:orchestrate', {
      prompt: prompt
    });
    
    if (!result.success) {
      console.error('Agent failed:', result.error);
      // Show error to user
      return null;
    }
    
    return result;
  } catch (error) {
    console.error('IPC Error:', error);
    // Show error to user
    return null;
  }
}
```

---

## 9. Testing Services

Test individual services directly:

```javascript
// Test Crawler
async function testCrawler(tabId) {
  console.log('Testing Crawler...');
  const result = await window.ipc.invoke('crawler:extract', { tabId });
  console.log('Crawler result:', result);
}

// Test Search
async function testSearch() {
  console.log('Testing Search...');
  const result = await window.ipc.invoke('search:analyze', {
    prompt: 'how to build agentic browser'
  });
  console.log('Search analysis:', result);
}

// Test AI
async function testAI() {
  console.log('Testing AI...');
  const result = await window.ipc.invoke('ai:answer', {
    prompt: 'What is an agentic browser?'
  });
  console.log('AI answer:', result);
}

// Run all tests
async function runTests(tabId) {
  await testCrawler(tabId);
  await testSearch();
  await testAI();
}
```

---

## Summary

Key principles:
- **Use Orchestrator** for high-level tasks (it handles routing)
- **Use individual services** for specific operations
- **Store context** in Memory for RAG capabilities
- **Generate reports** to save insights
- **Handle errors** gracefully
- **Monitor progress** for long-running tasks

For more details, see [ARCHITECTURE.md](./ARCHITECTURE.md)
