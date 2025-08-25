import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const execAsync = promisify(exec);

// Enhanced Function Registry with all function types
class FunctionRegistry {
    constructor(config) {
        this.functions = new Map();
        this.config = config;
        this.registerBuiltInFunctions();
    }

    registerBuiltInFunctions() {
        // Browser Functions
        this.register('browser', 'showAlert', {
            handler: async (message) => ({
                success: true,
                browserAction: 'alert',
                data: { message }
            }),
            parseArgs: (raw) => raw.trim(),
            description: 'Show an alert dialog in the browser'
        });

        this.register('browser', 'openWindow', {
            handler: async (url) => ({
                success: true,
                browserAction: 'openWindow',
                data: { url }
            }),
            parseArgs: (raw) => raw.trim(),
            description: 'Open a URL in a new browser window'
        });

        this.register('browser', 'showModal', {
            handler: async (url) => ({
                success: true,
                browserAction: 'modal',
                data: { url }
            }),
            parseArgs: (raw) => raw.trim(),
            description: 'Display a modal with embedded content'
        });

        this.register('browser', 'speak', {
            handler: async (text) => ({
                success: true,
                browserAction: 'speak',
                data: { text }
            }),
            parseArgs: (raw) => raw.trim(),
            description: 'Use text-to-speech to speak text aloud'
        });
    }

    register(type, name, definition) {
        this.functions.set(name, { type, name, ...definition });
        console.log(`Registered ${type} function: ${name}`);
    }

    // API Functions
    registerAPI(name, config) {
        this.register('api', name, {
            handler: async (args) => {
                try {
                    const url = typeof config.endpoint === 'function'
                        ? config.endpoint(args)
                        : config.endpoint;

                    const options = {
                        method: config.method || 'GET',
                        headers: {
                            'User-Agent': 'CorticalAI/2.0',
                            'Accept': 'application/json',
                            ...config.headers
                        },
                        ...(config.body && { body: JSON.stringify(config.body(args)) })
                    };

                    const response = await fetch(url, options);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    // Force JSON parsing regardless of content-type
                    const text = await response.text();
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (parseError) {
                        console.warn('Non-JSON response received:', text.substring(0, 200));
                        return { success: false, error: 'Invalid response format' };
                    }

                    return config.transform ? config.transform(data, args) : data;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description
        });
    }

    // Command Functions
    registerCommand(name, config) {
        this.register('command', name, {
            handler: async (args) => {
                try {
                    if (!this.config.security?.allowCommands) {
                        throw new Error('Command execution is disabled for security');
                    }

                    const command = typeof config.command === 'function'
                        ? config.command(args)
                        : config.command;

                    // Security validation
                    if (config.allowedCommands && !config.allowedCommands.some(cmd => command.startsWith(cmd))) {
                        throw new Error(`Command not allowed: ${command}`);
                    }

                    const { stdout, stderr } = await execAsync(command, {
                        timeout: config.timeout || 10000,
                        maxBuffer: config.maxBuffer || 1024 * 1024
                    });

                    return {
                        success: true,
                        stdout: stdout.toString(),
                        stderr: stderr.toString(),
                        command: command
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        command: typeof config.command === 'function' ? 'dynamic' : config.command
                    };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description
        });
    }

    // JavaScript/Node Functions
    registerScript(name, config) {
        this.register('script', name, {
            handler: async (args) => {
                try {
                    if (!this.config.security?.allowScripts) {
                        throw new Error('Script execution is disabled for security');
                    }

                    const result = await config.handler.call({
                        args,
                        console: console,
                        setTimeout,
                        Buffer
                    }, args);

                    return { success: true, result: result };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        stack: error.stack
                    };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description
        });
    }

    // N8N Integration
    registerN8N(name, config) {
        this.register('n8n', name, {
            handler: async (args) => {
                try {
                    const n8nEndpoint = config.endpoint || this.config.n8n?.endpoint;
                    if (!n8nEndpoint) {
                        throw new Error('N8N endpoint not configured');
                    }

                    const webhookUrl = `${n8nEndpoint}/webhook/${config.webhookId || name}`;

                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
                        },
                        body: JSON.stringify({
                            source: 'cortical-ai',
                            timestamp: new Date().toISOString(),
                            data: args
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`N8N workflow failed: ${response.status}`);
                    }

                    const result = await response.json();
                    return {
                        success: true,
                        workflow: config.webhookId || name,
                        result: result
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        workflow: config.webhookId || name
                    };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description || `Execute N8N workflow: ${name}`
        });
    }

    get(name) {
        return this.functions.get(name);
    }

    getAll() {
        return Array.from(this.functions.entries()).map(([name, def]) => ({
            name,
            type: def.type,
            description: def.description
        }));
    }
}

// Authentication Manager
class AuthenticationManager {
    constructor(config) {
        this.config = config;
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
        this.apiKeys = new Map();
        this.sessions = new Map();
        this.generateInitialApiKeys();
    }

    generateInitialApiKeys() {
        if (!this.config.auth.apiKeys?.enabled) return;

        const adminKey = this.generateApiKey('admin');
        this.apiKeys.set(adminKey, {
            name: 'Admin Key',
            role: 'admin',
            permissions: ['*'],
            created: new Date()
        });

        const uiKey = this.generateApiKey('ui');
        this.apiKeys.set(uiKey, {
            name: 'UI Key',
            role: 'ui',
            permissions: ['chat', 'examples', 'functions'],
            created: new Date()
        });

        console.log('🔑 API Keys generated - Admin:', adminKey, 'UI:', uiKey);
    }

    generateApiKey(prefix = 'cai') {
        return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
    }

    authenticateRequest(req) {
        // Check JWT token
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, this.jwtSecret);
                const session = this.sessions.get(decoded.sessionId);

                if (session) {
                    session.lastAccess = new Date();
                    return { user: session.user, session: decoded };
                }
            } catch (error) {
                console.warn('JWT verification failed:', error.message);
            }
        }

        // Check API key
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (apiKey && this.apiKeys.has(apiKey)) {
            const keyData = this.apiKeys.get(apiKey);
            keyData.lastUsed = new Date();

            return {
                user: { id: 'api', role: keyData.role, name: keyData.name },
                apiKey: keyData
            };
        }

        return null;
    }

    requireAuth(permissions = []) {
        return (req, res, next) => {
            if (this.config.auth.mode === 'disabled') {
                return next();
            }

            const auth = this.authenticateRequest(req);

            if (!auth) {
                return res.status(401).json({
                    error: 'Authentication required'
                });
            }

            req.auth = auth;
            next();
        };
    }
}

// Context Enhancer for system info
class ContextEnhancer {
    constructor() {
        this.systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            hostname: os.hostname(),
            memory: {
                total: Math.round(os.totalmem() / 1024 / 1024 / 1024),
                free: Math.round(os.freemem() / 1024 / 1024 / 1024)
            }
        };
    }

    enhanceRequestContext(req) {
        const userAgent = req.headers['user-agent'] || '';
        const ip = req.ip || 'unknown';

        return {
            timestamp: new Date().toISOString(),
            request: {
                ip: ip,
                userAgent: userAgent,
                browser: this.parseUserAgent(userAgent),
                host: req.headers.host,
                method: req.method,
                path: req.path
            },
            system: this.systemInfo
        };
    }

    parseUserAgent(userAgent) {
        if (!userAgent) return { name: 'Unknown', version: 'Unknown', os: 'Unknown' };

        let browser = 'Unknown';
        let os = 'Unknown';

        if (userAgent.includes('Chrome') && !userAgent.includes('Chromium')) {
            browser = 'Chrome';
        } else if (userAgent.includes('Firefox')) {
            browser = 'Firefox';
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            browser = 'Safari';
        }

        if (userAgent.includes('Windows NT')) {
            os = 'Windows';
        } else if (userAgent.includes('Mac OS X')) {
            os = 'macOS';
        } else if (userAgent.includes('Linux')) {
            os = 'Linux';
        }

        return { name: browser, os };
    }

    generateSystemPrompt(basePrompt, context, user = null) {
        const currentTime = new Date().toLocaleString();

        const contextualInfo = `
SYSTEM CONTEXT (Current Session):
- Time: ${currentTime}
- User's Browser: ${context.request.browser.name} on ${context.request.browser.os}
- Server: ${context.system.platform} ${context.system.arch}
${user ? `- User: ${user.email} (${user.role})` : '- Anonymous Session'}

FUNCTION CALLING RULES:
- Use EXACTLY this format: FUNCTION:functionName:arguments  
- For conversation: respond normally without function calls
- Never mix conversation and function calls in the same response

RESPONSE GUIDELINES:
- Be contextually aware of the user's time when relevant
- Provide actionable, specific assistance`;

        return `${basePrompt}\n\n${contextualInfo}`;
    }
}

// Main Framework Class
export class LLMFramework {
    constructor(config) {
        this.config = this.mergeWithDefaults(config);
        this.app = express();
        this.functionRegistry = new FunctionRegistry(this.config);
        this.contextEnhancer = new ContextEnhancer();
        this.authManager = null;
        this.examplePrompts = [];

        this.setupMiddleware();
        this.validateConfiguration();
        this.initializeComponents();
    }

    initializeComponents() {
        // Initialize authentication
        if (this.config.auth?.enabled) {
            this.authManager = new AuthenticationManager(this.config);
        }

        // Register user-defined functions
        this.registerUserFunctions();

        // Setup Swagger documentation
        this.setupSwaggerDocs();
    }

    registerUserFunctions() {
        const { functions = {} } = this.config;

        Object.entries(functions).forEach(([name, definition]) => {
            if (definition.type) {
                switch (definition.type) {
                    case 'api':
                        this.functionRegistry.registerAPI(name, definition);
                        break;
                    case 'command':
                        this.functionRegistry.registerCommand(name, definition);
                        break;
                    case 'script':
                        this.functionRegistry.registerScript(name, definition);
                        break;
                    case 'n8n':
                        this.functionRegistry.registerN8N(name, definition);
                        break;
                    default:
                        console.warn(`Unknown function type: ${definition.type}`);
                }
            } else {
                // Legacy function registration
                this.functionRegistry.register('api', name, definition);
            }
        });
    }

    setupSwaggerDocs() {
        const swaggerOptions = {
            definition: {
                openapi: '3.0.0',
                info: {
                    title: `${this.config.app.name} API`,
                    version: '2.0.0',
                    description: `API for ${this.config.app.description}`
                },
                servers: [
                    {
                        url: `http://${this.config.server.ip}:${this.config.server.port}`,
                        description: 'Development server'
                    }
                ]
            },
            apis: []
        };

        const swaggerSpec = swaggerJsdoc(swaggerOptions);

        this.app.use('/api/docs', swaggerUi.serve);
        this.app.get('/api/docs', swaggerUi.setup(swaggerSpec));

        console.log(`📚 API Documentation: http://${this.config.server.ip}:${this.config.server.port}/api/docs`);
    }

    mergeWithDefaults(config) {
        const defaults = {
            server: {
                port: process.env.SERVER_PORT || 3001,
                ip: process.env.SERVER_IP || "localhost",
                corsEnabled: process.env.SERVER_ENABLE_CORS !== 'false'
            },
            llm: {
                endpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434/api/generate",
                model: process.env.OLLAMA_MODEL || "gemma3:1b",
                timeout: parseInt(process.env.OLLAMA_TIMEOUT) || 900000,
                streamTimeout: parseInt(process.env.OLLAMA_STREAM_TIMEOUT) || 1200000
            },
            app: {
                name: process.env.APP_NAME || "AI Assistant",
                description: process.env.APP_DESCRIPTION || "AI-powered assistant",
                welcomeMessage: process.env.APP_WELCOMEMESSAGE || "Hello! How can I help you today?",
                primaryColor: `#${process.env.APP_PRIMARYCOLOR}` || "#007bff",
                secondaryColor: `#${process.env.APP_SECONDARYCOLOR}` || "#6c757d",
                backgroundImage: process.env.APP_BACKGROUND_IMAGE || null,
                chatOpacity: parseFloat(process.env.APP_CHAT_OPACITY) || 0.95,
                logo: process.env.APP_LOGO || null,
                botAvatar: process.env.APP_BOT_AVATAR || null,  // Add this line
                browserActions: process.env.APP_BROWSER_ACTIONS !== 'false',
                darkMode: process.env.APP_UI_DARKMODE === 'true'
            },
            functionPattern: new RegExp(process.env.APP_FUNCTION_PATTERN || "^FUNCTION:(\\w+):(.+)$"),
            functions: {},
            auth: {
                enabled: process.env.AUTH_ENABLED === 'true',
                mode: process.env.AUTH_MODE || 'disabled',
                apiKeys: { enabled: true }
            },
            security: {
                allowCommands: process.env.ALLOW_COMMANDS === 'true',
                allowScripts: process.env.ALLOW_SCRIPTS === 'true'
            },
            examples: {
                enabled: process.env.APP_EXAMPLES_ENABLED !== 'false',
                count: parseInt(process.env.APP_EXAMPLES_COUNT) || 6
            }
        };

        return this.deepMerge(defaults, config);
    }

    deepMerge(target, source) {
        const output = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                output[key] = source[key];
            }
        }
        return output;
    }

    setupMiddleware() {
        this.app.use(bodyParser.json());
        this.app.set('trust proxy', true);

        if (this.config.server.corsEnabled) {
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
                if (req.method === 'OPTIONS') {
                    res.sendStatus(200);
                } else {
                    next();
                }
            });
        }
    }

    validateConfiguration() {
        const required = ['server', 'llm', 'app', 'systemPrompt'];
        for (const section of required) {
            if (!this.config[section]) {
                throw new Error(`Missing required config section: ${section}`);
            }
        }
        console.log('✅ Configuration validated successfully');
    }

    detectFunctionCall(text) {
        const match = text.trim().match(this.config.functionPattern);
        if (match) {
            const [_, funcName, rawArgs] = match;
            const func = this.functionRegistry.get(funcName);
            if (func) {
                try {
                    const args = func.parseArgs(rawArgs);
                    return { function: funcName, args };
                } catch (error) {
                    console.error(`Error parsing args for ${funcName}:`, error);
                }
            }
        }
        return null;
    }

    getBrowserActionConfirmation(action, data) {
        const confirmations = {
            alert: `Alert displayed: "${data.message}"`,
            openWindow: `Opening new tab: ${data.url}`,
            modal: `Opening modal with: ${data.url}`,
            speak: `Speaking: "${data.text}"`
        };
        return confirmations[action] || `Browser action completed: ${action}`;
    }

    async streamLLMResponse(prompt, res) {
        const response = await fetch(this.config.llm.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.config.llm.model,
                prompt: prompt,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`LLM API error: ${response.status}`);
        }

        return new Promise((resolve, reject) => {
            let buffer = "";

            response.body.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.response) {
                                res.write(`data: ${JSON.stringify({
                                    type: "token",
                                    text: parsed.response
                                })}\n\n`);
                            }
                            if (parsed.done) {
                                res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
                                res.end();
                                resolve();
                                return;
                            }
                        } catch (e) {
                            console.error('Parse error:', e);
                        }
                    }
                }
            });

            response.body.on('end', () => {
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
                    res.end();
                }
                resolve();
            });

            response.body.on('error', reject);
        });
    }

    setupRoutes() {
        // Enhanced chat endpoint with context
        this.app.post("/api/v1/chat/stream",
            this.authManager?.requireAuth(['chat']) || ((req, res, next) => next()),
            async (req, res) => {
                const { message } = req.body;
                const context = this.contextEnhancer.enhanceRequestContext(req);

                res.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                });

                try {
                    // Enhanced system prompt with context
                    const systemPrompt = this.contextEnhancer.generateSystemPrompt(
                        this.config.systemPrompt,
                        context,
                        req.auth?.user
                    );

                    const fullPrompt = `${systemPrompt}\n\nUser says: "${message}"\n\nAssistant responds: `;

                    // Check for function calls first
                    const functionCall = this.detectFunctionCall(message);

                    if (functionCall) {
                        res.write(`data: ${JSON.stringify({
                            type: "status",
                            text: "Processing your request..."
                        })}\n\n`);

                        try {
                            const func = this.functionRegistry.get(functionCall.function);
                            if (!func) {
                                throw new Error(`Function ${functionCall.function} not found`);
                            }

                            const result = await func.handler(functionCall.args);

                            // Handle different result types
                            if (result.success && result.browserAction) {
                                res.write(`data: ${JSON.stringify({
                                    type: "browser_action",
                                    action: result.browserAction,
                                    data: result.data
                                })}\n\n`);

                                res.write(`data: ${JSON.stringify({
                                    type: "token",
                                    text: this.getBrowserActionConfirmation(result.browserAction, result.data)
                                })}\n\n`);
                            } else if (result.results || result.success) {
                                res.write(`data: ${JSON.stringify({
                                    type: "function_result",
                                    data: result
                                })}\n\n`);
                            }

                            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
                            res.end();

                        } catch (error) {
                            res.write(`data: ${JSON.stringify({
                                type: "error",
                                error: error.message
                            })}\n\n`);
                            res.end();
                        }
                    } else {
                        // Regular conversation - stream LLM response
                        await this.streamLLMResponse(fullPrompt, res);
                    }

                } catch (error) {
                    console.error("Chat error:", error);
                    res.write(`data: ${JSON.stringify({
                        type: "error",
                        error: error.message
                    })}\n\n`);
                    res.end();
                }
            }
        );

        //config endpoint
        this.app.get("/api/v1/config",
            this.authManager?.requireAuth(['config']) || ((req, res, next) => next()),
            (req, res) => {
                const publicConfig = {
                    app: {
                        name: this.config.app.name,
                        description: this.config.app.description,
                        primaryColor: this.config.app.primaryColor,
                        secondaryColor: this.config.app.secondaryColor,
                        backgroundImage: this.config.app.backgroundImage,
                        chatOpacity: this.config.app.chatOpacity,
                        logo: this.config.app.logo,
                        botAvatar: this.config.app.botAvatar,  // Add this line
                        darkMode: this.config.app.darkMode
                    },
                    functions: this.functionRegistry.getAll().length,
                    auth: {
                        enabled: this.config.auth?.enabled || false
                    }
                };

                res.json({
                    success: true,
                    config: publicConfig
                });
            }
        );

        // Functions endpoint
        this.app.get("/api/v1/functions",
            this.authManager?.requireAuth(['functions']) || ((req, res, next) => next()),
            (req, res) => {
                const functions = this.functionRegistry.getAll();
                res.json({ functions, total: functions.length });
            }
        );

        // Examples endpoint (existing logic)
        this.app.get("/examples", async (req, res) => {
            try {
                if (this.examplePrompts.length === 0) {
                    this.examplePrompts = [
                        'Hello, what can you help me with?',
                        'Tell me about your capabilities',
                        'What functions do you have available?',
                        'Help me get started'
                    ];
                }
                res.json({ success: true, examples: this.examplePrompts });
            } catch (error) {
                res.json({ success: false, examples: this.examplePrompts });
            }
        });

        // React frontend endpoint (serve static build or development proxy)
        if (process.env.DISABLE_DEFAULT_UI !== 'true') {
            // In development, you'd typically proxy to React dev server on port 3000
            // In production, serve the built React app from build/dist folder

            if (process.env.NODE_ENV === 'production') {
                // Serve static React build files
                this.app.use(express.static('build'));

                this.app.get("*", (req, res) => {
                    const context = this.contextEnhancer.enhanceRequestContext(req);
                    const apiKey = this.authManager?.apiKeys ?
                        Array.from(this.authManager.apiKeys.keys())
                            .find(key => this.authManager.apiKeys.get(key).role === 'ui') :
                        null;

                    // Inject config into React app via window object
                    const configScript = `
                        <script>
                            window.CORTICAL_CONFIG = ${JSON.stringify({
                        apiUrl: `http://${this.config.server.ip}:${this.config.server.port}`,
                        apiKey: apiKey,
                        app: this.config.app,
                        auth: { enabled: this.config.auth?.enabled },
                        features: {
                            functions: this.functionRegistry.getAll().length,
                            auth: !!this.authManager
                        }
                    })};
                        </script>
                    `;

                    // Read and modify the React build index.html
                    const fs = require('fs');
                    const path = require('path');
                    const indexPath = path.join(process.cwd(), 'build', 'index.html');

                    if (fs.existsSync(indexPath)) {
                        let html = fs.readFileSync(indexPath, 'utf8');
                        // Inject config before closing head tag
                        html = html.replace('</head>', `${configScript}</head>`);
                        res.send(html);
                    } else {
                        res.status(404).json({
                            error: 'React build not found. Run `npm run build` first.'
                        });
                    }
                });
            } else {
                // Development mode - provide API info and React dev server instructions
                this.app.get("/", (req, res) => {
                    const context = this.contextEnhancer.enhanceRequestContext(req);
                    const apiKey = this.authManager?.apiKeys ?
                        Array.from(this.authManager.apiKeys.keys())
                            .find(key => this.authManager.apiKeys.get(key).role === 'ui') :
                        null;

                    res.json({
                        message: "CorticalAI v2.0 API Server",
                        development: true,
                        react_frontend: "Start React dev server separately on port 3000",
                        api_docs: `http://${this.config.server.ip}:${this.config.server.port}/api/docs`,
                        health: `http://${this.config.server.ip}:${this.config.server.port}/api/v1/health`,
                        config: {
                            apiUrl: `http://${this.config.server.ip}:${this.config.server.port}`,
                            apiKey: apiKey,
                            app: this.config.app
                        },
                        context: context
                    });
                });
            }
        }

        // Enhanced health endpoint
        this.app.get("/api/v1/health", (req, res) => {
            const context = this.contextEnhancer.enhanceRequestContext(req);
            res.json({
                status: "ok",
                app: this.config.app.name,
                version: "2.0.0",
                features: {
                    functions: this.functionRegistry.getAll().length,
                    auth: !!this.authManager,
                    ui: process.env.DISABLE_DEFAULT_UI !== 'true'
                },
                system: context.system,
                timestamp: new Date().toISOString()
            });
        });
    }

    async start() {
        this.setupRoutes();

        this.app.listen(this.config.server.port, this.config.server.ip, () => {
            console.log(`
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║   🧠 CorticalAI v2.0 - Enhanced Framework                                                 ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  🚀 Server: http://${this.config.server.ip}:${this.config.server.port}                                               ║
║  🤖 Model: ${this.config.llm.model.padEnd(60)} ║
║  ⚡ Functions: ${this.functionRegistry.getAll().length.toString().padStart(2)} registered                                           ║
║  🔐 Auth: ${(this.authManager ? 'Enabled' : 'Disabled').padEnd(10)}                                                ║
║  📚 Docs: http://${this.config.server.ip}:${this.config.server.port}/api/docs                               ║
║  🌐 UI: ${process.env.DISABLE_DEFAULT_UI === 'true' ? 'Disabled' : 'Enabled'}                                                    ║
║  ✅ Status: Ready                                                                       ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
            `);
        });
    }
}