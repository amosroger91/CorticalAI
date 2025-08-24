# CorticalAI – Build Custom AI Agents in Minutes

![Alt text](./assets/logo.png)

Inspired by the Cortical Scanner Dr. Halsey used to create Cortana in the Halo series, CorticalAI lets you spin up fully functional AI agents in minutes, not hours. Build assistants that can think, interact, call APIs, and control the browser seamlessly—giving you the power to automate tasks and experiment with AI faster than ever.

CorticalAI is a **monolithic, beginner-friendly framework** aimed at web developers who want to build custom AI agents without struggling with multiple moving parts. It combines:

- **Server** (Express.js-based)  
- **Dynamic Web UI** (chat interface included)  
- **Orchestration layer** (function calling, prompt management)  
- **Browser Actions** (alerts, navigation, modals, speech)
- **Background & Theming** (custom backgrounds, transparency, colors)
- **Navigation System** (logo, menu links, branding)
- **Auto-generated Examples** (contextual prompts from your LLM)
- **MCP-ready** (Model Context Protocol) for LLM context handling  

into a single, easy-to-understand package.  

---

## Why This Exists

Developers often struggle with starting AI projects because:

- LLM orchestration involves separate server, client, and function management layers  
- Function-calling models (like Gemma) require boilerplate for API handling and parsing  
- Streaming responses and integrating multiple APIs is messy  
- Building interactive UIs with dynamic behavior takes significant time

**CorticalAI solves this by combining everything**: UI, server, orchestration, browser control, and theming — so developers can focus on **what their AI does**, not how it's wired.

---

## Features

### Core Framework
- **Plug-and-play LLM support** – works with any function-calling capable model (e.g., Gemma)  
- **Dynamic chat UI** – real-time streaming of responses with modern design
- **Function calling support** – define API handlers with argument parsing  
- **Extensible configuration** – all defaults can be overridden via `config` or `.env`  
- **Streaming and non-streaming modes** – handles both synchronous and async responses gracefully  
- **Health check endpoint** – `/health` with system status
- **Error handling and timeouts** – built-in for robust API calls  

### Browser Actions
- **JavaScript Alerts** – `FUNCTION:showAlert:Your message here`
- **Window Navigation** – `FUNCTION:openWindow:https://example.com`  
- **Modal Popups** – `FUNCTION:showModal:https://widget.example.com`
- **Text-to-Speech** – `FUNCTION:speak:Hello, welcome to our site!`

### Visual Customization
- **Custom Backgrounds** – images or videos with configurable transparency
- **Color Theming** – primary/secondary colors throughout the interface
- **Logo & Navigation** – brand logo and navigation menu with internal/external links
- **Responsive Design** – works on desktop and mobile

### Smart Features
- **Auto-generated Examples** – your LLM creates contextual example prompts
- **Function Documentation** – automatically explains available functions to users
- **Dynamic UI Updates** – real-time result display for any function type

---

## Installation

```bash
git clone https://github.com/amosroger91/CorticalAI.git
cd CorticalAI
npm install
```

Create a `.env` file with your configuration:

```env
# Server Configuration
SERVER_PORT=3001
SERVER_IP=localhost
SERVER_ENABLE_CORS=true

# App Branding & UI
APP_NAME=My AI Assistant
APP_DESCRIPTION=Custom AI Agent
APP_WELCOMEMESSAGE=Hello! How can I help you today?
APP_PRIMARYCOLOR=1DB954
APP_SECONDARYCOLOR=191414
APP_BACKGROUND_IMAGE=https://example.com/background.jpg
APP_CHAT_OPACITY=0.9
APP_LOGO=https://example.com/logo.png
APP_NAVIGATION_LINKS=Home|/|false,Docs|https://docs.example.com|true

# Features
APP_EXAMPLES_ENABLED=true
APP_EXAMPLES_COUNT=6
APP_BROWSER_ACTIONS=true

# LLM Configuration
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
OLLAMA_MODEL=gemma3:1b
OLLAMA_TIMEOUT=900000
OLLAMA_STREAM_TIMEOUT=1200000
```

---

## Quick Start Example

![Alt text](./assets/example.png)

```javascript
import { LLMFramework } from './framework.js';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  systemPrompt: `You are a helpful assistant. You can search, show alerts, open links, and speak to users.`,

  functions: {
    searchMusic: {
      handler: async (term) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&limit=10`;
        const response = await fetch(url);
        const data = await response.json();
        return { success: true, results: data.results };
      },
      parseArgs: raw => raw.trim()
    }
  }
};

const framework = new LLMFramework(CONFIG);
framework.start();
```

Visit `http://localhost:3001` to see your chat interface live.

---

## How It Works

1. **Incoming user message** → passed to the LLM  
2. **LLM generates a response**  
   - Chat reply  
   - API function call (`FUNCTION:searchMusic:Beatles`)
   - Browser action (`FUNCTION:showAlert:Task completed!`)
3. **Framework detects and routes the call**  
4. **Executes handler or browser action**  
5. **Streams results back to UI**  

All of this is **automatic** — developers only need to define functions and system prompts.

---

## Function Types

### API Functions (Server-side)
```javascript
functions: {
  searchData: {
    handler: async (query) => {
      // API call logic
      return { success: true, results: data };
    },
    parseArgs: raw => raw.trim()
  }
}
```

### Browser Actions (Client-side)
Automatically available when `APP_BROWSER_ACTIONS=true`:

- `FUNCTION:showAlert:Your alert message`
- `FUNCTION:openWindow:https://external-site.com`  
- `FUNCTION:showModal:https://widget.example.com`
- `FUNCTION:speak:Text to be spoken aloud`

---

## Configuration Reference

### Server Settings
| Key | Description | Default |
|-----|-------------|---------|
| `SERVER_PORT` | Express server port | `3001` |
| `SERVER_IP` | Server host | `localhost` |
| `SERVER_ENABLE_CORS` | Enable CORS headers | `true` |

### LLM Settings
| Key | Description | Default |
|-----|-------------|---------|
| `OLLAMA_ENDPOINT` | LLM API endpoint | `http://localhost:11434/api/generate` |
| `OLLAMA_MODEL` | LLM model to use | `gemma3:1b` |
| `OLLAMA_TIMEOUT` | Request timeout (ms) | `900000` |
| `OLLAMA_STREAM_TIMEOUT` | Stream timeout (ms) | `1200000` |

### App Appearance
| Key | Description | Default |
|-----|-------------|---------|
| `APP_NAME` | Application name | `AI Assistant` |
| `APP_DESCRIPTION` | Application description | `AI-powered assistant` |
| `APP_WELCOMEMESSAGE` | Initial chat message | `Hello! How can I help you today?` |
| `APP_PRIMARYCOLOR` | Primary color (hex) | `007bff` |
| `APP_SECONDARYCOLOR` | Secondary color (hex) | `6c757d` |
| `APP_BACKGROUND_IMAGE` | Background image/video URL | `null` |
| `APP_CHAT_OPACITY` | Chat window transparency (0-1) | `0.95` |
| `APP_LOGO` | Logo image URL | `null` |
| `APP_NAVIGATION_LINKS` | Menu links (Text\|URL\|External,...) | `null` |

### Features
| Key | Description | Default |
|-----|-------------|---------|
| `APP_EXAMPLES_ENABLED` | Auto-generate example prompts | `true` |
| `APP_EXAMPLES_COUNT` | Number of examples to generate | `6` |
| `APP_BROWSER_ACTIONS` | Enable browser action functions | `true` |
| `APP_FUNCTION_PATTERN` | Regex for detecting function calls | `^FUNCTION:(\\w+):(.+)$` |

---

## Advanced Examples

### Multi-Function Agent
```javascript
const CONFIG = {
  systemPrompt: `You are a productivity assistant. You can:
  - Search information (searchWeb)
  - Show alerts for reminders (showAlert) 
  - Open relevant links (openWindow)
  - Speak confirmations (speak)`,
  
  functions: {
    searchWeb: {
      handler: async (query) => {
        // Your search implementation
      },
      parseArgs: raw => raw.trim()
    }
  }
};
```

### Custom Branded Experience
```env
APP_NAME=Acme Support Bot
APP_LOGO=https://acme.com/logo.png
APP_BACKGROUND_IMAGE=https://acme.com/bg.jpg
APP_PRIMARYCOLOR=ff6b35
APP_NAVIGATION_LINKS=Home|https://acme.com|true,Support|mailto:help@acme.com|true
```

---

## Browser Action Security

Browser actions run in the client's browser with appropriate restrictions:

- **Modals**: Use iframe sandboxing for security
- **Window navigation**: Opens in new tabs with `noopener,noreferrer`
- **Speech**: Uses native Web Speech API
- **Alerts**: Standard browser alert dialogs

---

## Model Requirements

- Must support **function calling** (e.g., Gemma, GPT, Claude)
- Must support streaming for optimal UX  
- Should handle structured output patterns
- Recommended: Models with strong instruction following

---

## Example Interactions

```
User: "Remind me about the meeting"
LLM: FUNCTION:showAlert:Don't forget: Team meeting at 3 PM today

User: "Show me the project dashboard" 
LLM: FUNCTION:showModal:https://dashboard.example.com

User: "Open the documentation"
LLM: FUNCTION:openWindow:https://docs.example.com

User: "Welcome our new user"
LLM: FUNCTION:speak:Welcome to our platform! We're excited to have you here.
```

---

## Deployment

CorticalAI works anywhere Node.js runs:

- **Development**: `npm start` 
- **Production**: PM2, Docker, or cloud platforms
- **Docker**: Dockerfile included for containerization
- **Cloud**: Deploy to Heroku, Railway, DigitalOcean, etc.

---

## Contributing

- PRs welcome for new features and bug fixes
- Ensure functions support `async` execution and proper error handling
- Keep UI dynamic: all new functions should display results automatically
- Follow the existing code style and patterns
- Add tests for new functionality

---

## Roadmap

- [ ] Plugin system for third-party functions
- [ ] Voice input integration  
- [ ] Multi-language UI support
- [ ] Enhanced analytics and logging
- [ ] WebSocket support for real-time updates
- [ ] Mobile app wrapper

---

## License

MIT

---

**CorticalAI**: Make custom AI agents in minutes, not weeks. Streamline function calls, integrate APIs, control browsers, and build beautiful interfaces — all from one framework.