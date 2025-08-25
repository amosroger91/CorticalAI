# CorticalAI v2.0 — Production-Ready AI Agent Framework

![CorticalAI Logo](./assets/logo.png)

Inspired by the Cortical Scanner Dr. Halsey used to create Cortana in the Halo series, CorticalAI v2.0 is a production-ready framework for building sophisticated AI agents with multiple function types, authentication, and comprehensive API documentation.

CorticalAI combines everything you need to build powerful AI assistants:

- **Enhanced Function System** (API calls, system commands, JavaScript execution, N8N workflows, browser actions)
- **Multi-Provider Authentication** (Google OAuth, Azure/Microsoft 365, local auth)
- **Auto-Generated API Documentation** (Swagger/OpenAPI integration)
- **Context-Aware System Prompts** (user browser, location, time awareness)
- **Security Controls** (command sandboxing, permission systems)
- **Web Server & Dynamic UI** (Express.js backend with customizable frontend)

into a single, production-ready package.

---

## What's New in v2.0

### Enhanced Function Types
- **API Functions**: HTTP requests with automatic JSON parsing and error handling
- **Command Functions**: Secure system command execution with whitelisting
- **Script Functions**: JavaScript code execution in sandboxed environment  
- **N8N Functions**: Direct workflow integration with n8n automation platform
- **Browser Functions**: Client-side actions (alerts, navigation, speech)

### Security & Authentication
- **Multi-provider OAuth**: Google, Azure/Microsoft 365 integration
- **API Key Management**: Automatic generation with role-based permissions
- **JWT Token System**: Secure session management with refresh tokens
- **Command Sandboxing**: Whitelist-based command execution controls

### Enhanced Context Awareness
- **User Environment Detection**: Browser, OS, location, timezone
- **Dynamic System Prompts**: Contextual information injection
- **Request Metadata**: IP, user agent, timestamp tracking

### Developer Experience
- **Auto-Generated Docs**: Swagger UI at `/api/docs`
- **Function Documentation**: Automatic endpoint discovery
- **Enhanced Error Handling**: Comprehensive logging and debugging
- **Production Security**: HTTPS support, CORS configuration

---

## Installation

```bash
git clone https://github.com/amosroger91/CorticalAI.git
cd CorticalAI
npm install
```

### Environment Configuration

Create a `.env` file:

```env
# Server Configuration
SERVER_PORT=3001
SERVER_IP=localhost
SERVER_ENABLE_CORS=true

# App Configuration
APP_NAME=CorticalAI Assistant
APP_DESCRIPTION=Advanced AI assistant with function calling capabilities
APP_WELCOMEMESSAGE=Hello! I can search, execute commands, show alerts, and more. How can I help?
APP_PRIMARYCOLOR=1DB954
APP_SECONDARYCOLOR=191414

# LLM Configuration
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
OLLAMA_MODEL=gemma2:9b

# Security Settings
ALLOW_COMMANDS=true
ALLOW_SCRIPTS=false

# Authentication (optional)
AUTH_ENABLED=false
AUTH_MODE=optional
JWT_SECRET=your-jwt-secret-here

# OAuth Providers (if auth enabled)
GOOGLE_CLIENT_ID=your-google-client-id
AZURE_CLIENT_ID=your-azure-client-id

# UI Control
DISABLE_DEFAULT_UI=false
```

---

## Enhanced Function System

### API Functions

These are API calls

```javascript
functions: {
  searchData: {
    type: 'api',
    endpoint: (query) => `https://api.example.com/search?q=${encodeURIComponent(query)}`,
    method: 'GET',
    parseArgs: (raw) => raw.trim(),
    transform: (data, query) => ({
      success: true,
      results: data.results,
      searchTerm: query
    }),
    description: 'Search external API for information'
  }
}
```

### Command Functions

These are terminal commands that are ran on the host server running CorticalAI

```javascript
functions: {
  pingHost: {
    type: 'command',
    command: (host) => `ping -c 4 ${host}`,
    parseArgs: (raw) => raw.trim(),
    allowedCommands: ['ping', 'nslookup'],
    timeout: 15000,
    description: 'Test network connectivity to a host'
  }
}
```

### Script Functions

These are functions that execute on the Node.js Express server

```javascript
functions: {
  calculateStats: {
    type: 'script',
    handler: async function(numbers) {
      const nums = numbers.split(',').map(Number);
      return {
        sum: nums.reduce((a, b) => a + b, 0),
        average: nums.reduce((a, b) => a + b, 0) / nums.length,
        count: nums.length
      };
    },
    parseArgs: (raw) => raw.trim(),
    description: 'Calculate statistics for a list of numbers'
  }
}
```

### N8N Workflow Integration

These are native integrations with the N8N webhook system

```javascript
functions: {
  createTicket: {
    type: 'n8n',
    webhookId: 'support-ticket',
    parseArgs: (raw) => {
      const [title, description] = raw.split('|');
      return { title, description };
    },
    description: 'Create support ticket via N8N workflow'
  }
}
```

---

## Enhanced Quick Start

```javascript
import { LLMFramework } from './framework.js';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  systemPrompt: `You are an advanced AI assistant with multiple capabilities:
  - Search information: "search for [topic]"
  - System commands: "ping [host]" or "check system status"  
  - Browser actions: "alert [message]" or "open [url]"
  - Calculations: "calculate stats for [numbers]"`,

  functions: {
    // DuckDuckGo search with enhanced error handling
    searchDuck: {
      type: 'api',
      endpoint: (query) => {
        const url = new URL("https://api.duckduckgo.com/");
        url.searchParams.set('q', query);
        url.searchParams.set('format', 'json');
        return url.toString();
      },
      method: 'GET',
      parseArgs: (raw) => raw.trim(),
      transform: (data, query) => {
        // Enhanced result processing with fallbacks
        const results = [];
        
        if (data.AbstractText) {
          results.push({
            title: data.Heading || 'Abstract',
            content: data.AbstractText,
            source: data.AbstractSource
          });
        }
        
        return results.length > 0 ? {
          success: true,
          results,
          totalResults: results.length,
          searchTerm: query
        } : {
          success: true,
          results: [{
            title: `Search "${query}"`,
            content: 'No direct results found.',
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
          }],
          totalResults: 1,
          searchTerm: query
        };
      },
      description: 'Search DuckDuckGo for information'
    },

    // Network diagnostics
    pingHost: {
      type: 'command',
      command: (host) => `ping -c 4 ${host}`,
      parseArgs: (raw) => raw.trim(),
      allowedCommands: ['ping'],
      description: 'Test network connectivity'
    },

    // Statistical calculations
    calculateStats: {
      type: 'script',
      handler: async function(numbersString) {
        const numbers = numbersString.split(',').map(n => parseFloat(n.trim()));
        const sum = numbers.reduce((a, b) => a + b, 0);
        return {
          numbers,
          sum,
          average: sum / numbers.length,
          min: Math.min(...numbers),
          max: Math.max(...numbers)
        };
      },
      parseArgs: (raw) => raw.trim(),
      description: 'Calculate statistics for numbers'
    }
  },

  security: {
    allowCommands: true,
    allowScripts: true
  }
};

const framework = new LLMFramework(CONFIG);
framework.start();
```

---

## API Documentation

CorticalAI v2.0 automatically generates comprehensive API documentation:

- **Interactive Docs**: Available at `http://localhost:3001/api/docs`
- **OpenAPI Spec**: Raw specification at `/api/openapi.json`
- **Function Documentation**: Detailed function info at `/api/v1/functions/docs`

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/chat/stream` | POST | Stream chat with function calling |
| `/api/v1/functions` | GET | List available functions |
| `/api/v1/health` | GET | System status and metrics |
| `/api/v1/auth/login` | POST | Authenticate user (if auth enabled) |
| `/api/docs` | GET | Interactive API documentation |

---

## Security Features

### Command Execution Security
```javascript
security: {
  allowCommands: true,        // Enable/disable command functions
  allowScripts: false         // Enable/disable script functions
}

functions: {
  secureCommand: {
    type: 'command',
    allowedCommands: ['ping', 'nslookup', 'dig'],  // Whitelist
    timeout: 10000,                                 // Execution timeout
    maxBuffer: 1024 * 1024                         // Output size limit
  }
}
```

### Authentication Modes
- **disabled**: No authentication required
- **optional**: Authentication available but not required
- **required**: All endpoints require authentication

### API Key Management
```javascript
auth: {
  enabled: true,
  apiKeys: { enabled: true }
}
```

Automatically generates:
- Admin API key for full access
- UI API key for frontend communication

---

## Enhanced Configuration

### New Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_ENABLED` | Enable authentication system | `false` |
| `AUTH_MODE` | Authentication mode | `disabled` |
| `ALLOW_COMMANDS` | Enable command functions | `false` |
| `ALLOW_SCRIPTS` | Enable script functions | `false` |
| `DISABLE_DEFAULT_UI` | Disable built-in UI | `false` |
| `JWT_SECRET` | JWT signing secret | Auto-generated |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | None |
| `AZURE_CLIENT_ID` | Azure OAuth client ID | None |

### Context-Aware Features

The framework now automatically includes:
- User's browser and operating system
- Current date and time with timezone
- IP address and geolocation (if available)
- System information (memory, CPU, platform)
- Request metadata and headers

---

## Function Call Examples

### Search Operations
```
User: "search for artificial intelligence"
Assistant: FUNCTION:searchDuck:artificial intelligence

User: "what's the weather in London"  
Assistant: FUNCTION:getWeather:London
```

### System Operations
```
User: "ping google.com"
Assistant: FUNCTION:pingHost:google.com

User: "check system status"
Assistant: FUNCTION:getSystemInfo:
```

### Browser Actions
```
User: "alert me when done"
Assistant: FUNCTION:showAlert:Task completed successfully!

User: "open the documentation"
Assistant: FUNCTION:openWindow:https://docs.example.com
```

### Data Processing
```
User: "calculate stats for 1,5,10,15,20"
Assistant: FUNCTION:calculateStats:1,5,10,15,20
```

---

## Production Deployment

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
```

### Environment Security
- Use strong JWT secrets in production
- Configure proper CORS origins
- Enable HTTPS with certificates
- Use environment-specific OAuth credentials
- Implement rate limiting for public endpoints

### Monitoring
- Health endpoint at `/api/v1/health` includes system metrics
- Comprehensive error logging with context
- Request/response tracking for debugging
- Function execution metrics and timing

---

## Migration from v1.x

### Breaking Changes
- Function definition format changed (add `type` field)
- New authentication system (optional)
- Enhanced security controls
- Updated API endpoints (now under `/api/v1/`)

### Migration Steps
1. Update function definitions to include `type` field
2. Install new dependencies: `jsonwebtoken swagger-jsdoc swagger-ui-express`
3. Update environment variables (see new configuration)
4. Test function calling with enhanced error handling
5. Review security settings for command/script functions

---

## Contributing

- Follow security best practices for new functions
- Add comprehensive error handling and validation
- Include function documentation and examples
- Test with multiple LLM models for compatibility
- Update API documentation for new endpoints

---

## Roadmap

### Completed in v2.0
- ✅ Enhanced function type system
- ✅ Multi-provider authentication
- ✅ Auto-generated API documentation
- ✅ Context-aware system prompts
- ✅ Security controls and sandboxing

### Upcoming Features
- [ ] React frontend components package
- [ ] ChromaDB RAG integration
- [ ] WebSocket real-time communication
- [ ] Docker Compose orchestration
- [ ] Kubernetes deployment manifests
- [ ] Performance monitoring dashboard

---

## License

MIT

---

> "May the favor of the Lord our God rest on us; establish the work of our hands for us— yes, establish the work of our hands."
>
> **Psalm 90:17**