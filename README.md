# CorticalAI – Build Custom AI Agents in Minutes

Inspired by the Cortical Scanner Dr. Halsey used to create Cortana in the Halo series, CorticalAI lets you spin up fully functional AI agents in minutes, not hours. Build assistants that can think, interact, and call APIs seamlessly—giving you the power to automate tasks and experiment with AI faster than ever.

CorticalAI is a **monolithic, beginner-friendly framework** aimed at web developers who want to build custom AI agents without struggling with multiple moving parts. It combines:

- **Server** (Express.js-based)  
- **Dynamic Web UI** (chat interface included)  
- **Orchestration layer** (function calling, prompt management)  
- **MCP-ready** (Model Context Protocol) for LLM context handling  

into a single, easy-to-understand package.  

---

## Why This Exists

Developers often struggle with starting AI projects because:

- LLM orchestration involves separate server, client, and function management layers  
- Function-calling models (like Gemma) require boilerplate for API handling and parsing  
- Streaming responses and integrating multiple APIs is messy  

**CorticalAI solves this by combining everything**: UI, server, orchestration, and function calling — so developers can focus on **what their AI does**, not how it’s wired.

---

## Features

- **Plug-and-play LLM support** – works with any function-calling capable model (e.g., Gemma)  
- **Dynamic chat UI** – real-time streaming of responses  
- **Function calling support** – define API handlers with argument parsing  
- **Extensible configuration** – all defaults can be overridden via `config` or `.env`  
- **Streaming and non-streaming modes** – handles both synchronous and async responses gracefully  
- **Health check endpoint** – `/health`  
- **Error handling and timeouts** – built-in for robust API calls  

---

## Installation

```bash
git clone <repo_url>
cd CorticalAI
npm install
```

Create a `.env` file based on the example:

```env
SERVER_PORT=3001
SERVER_IP=localhost
SERVER_ENABLE_CORS=true

APP_NAME=My AI Assistant
APP_DESCRIPTION=Custom AI Agent
APP_WELCOMEMESSAGE=Hello! How can I help you today?
APP_PRIMARYCOLOR=1DB954
APP_SECONDARYCOLOR=191414

OLLAMA_ENDPOINT=http://localhost:11434/api/generate
OLLAMA_MODEL=gemma3:1b
OLLAMA_TIMEOUT=900000
OLLAMA_STREAM_TIMEOUT=1200000
```

---

## Quick Start Example

```javascript
import { CorticalAI } from './framework.js';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  systemPrompt: `You are a custom AI assistant. You can chat and call functions.`,

  functions: {
    searchMusic: {
      handler: async (term) => {
        const url = `https://itunes.apple.com/search?term=\${encodeURIComponent(term)}&limit=10`;
        const response = await fetch(url);
        const data = await response.json();
        return { success: true, results: data.results };
      },
      parseArgs: raw => raw.trim()
    }
  }
};

const framework = new CorticalAI(CONFIG);
framework.start();
```

Visit `http://localhost:3001` to see your chat interface live.

---

## How It Works

1. **Incoming user message** → passed to the LLM  
2. **LLM generates a response**  
   - Either a chat reply  
   - Or a function call (`FUNCTION:<functionName>:<args>`)  
3. **Framework detects function calls**  
4. **Executes registered handler**  
5. **Streams results back to UI**  

All of this is **automatic** — developers only need to define functions and system prompts.

---

## Configuration

| Key | Description | Default |
|-----|-------------|---------|
| `server.port` | Express server port | `3001` |
| `server.ip` | Server host | `localhost` |
| `server.corsEnabled` | Enable CORS headers | `true` |
| `llm.endpoint` | LLM API endpoint | `http://localhost:11434/api/generate` |
| `llm.model` | LLM model to use | `gemma3:1b` |
| `llm.timeout` | Request timeout (ms) | `900000` |
| `llm.streamTimeout` | Stream timeout (ms) | `1200000` |
| `app.name` | Application name | `AI Assistant` |
| `app.description` | Application description | `AI-powered assistant` |
| `app.welcomeMessage` | Initial chat message | `Hello! How can I help you today?` |
| `functions` | Object of registered functions | `{}` |
| `functionPattern` | Regex for detecting function calls | `^FUNCTION:(\\\\w+):(.+)$` |

---

## Recommended Model Requirements

- Must support **function calling** (e.g., Gemma: [https://ai.google.dev/gemma/docs/capabilities/function-calling](https://ai.google.dev/gemma/docs/capabilities/function-calling))  
- Must support streaming for best UX  
- Should handle structured JSON responses  

---

## Example Function Call

```
User: find Metallica
LLM Response: FUNCTION:searchMusic:Metallica
Framework: calls `searchMusic` handler and streams results to UI
```

---

## Extensibility

You can define **any function** that:

1. Has a `handler` that receives parsed arguments  
2. Implements `parseArgs(raw)` to transform the LLM output into usable input  

This means your AI agent can talk to:

- REST APIs  
- Internal company endpoints  
- Third-party services  

All without touching the UI or server boilerplate.

---

## Contributing

- PRs welcome!  
- Ensure functions support `async` execution and proper error handling.  
- Keep UI dynamic: all new functions should display results automatically.

---

## License

MIT

---

**CorticalAI**: Make custom AI agents in minutes, not weeks. Streamline function calls, integrate APIs, and get your agents running fast.
`;
# CorticalAI
# CorticalAI
# CorticalAI
