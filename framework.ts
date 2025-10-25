import express, { Express, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import fetch, { RequestInit } from "node-fetch";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { ChromaClient } from 'chromadb';
import swaggerJsdoc from "swagger-jsdoc";
import client from 'prom-client';
import swaggerUi from "swagger-ui-express";

const execAsync = promisify(exec);

// Type Definitions
interface FunctionDefinition {
    type: string;
    name: string;
    handler: (args: any) => Promise<any>;
    parseArgs: (raw: string) => any;
    description: string;
    [key: string]: any;
}

interface ApiKey {
    name: string;
    role: string;
    permissions: string[];
    created: Date;
    lastUsed?: Date;
}

interface Session {
    user: any;
    lastAccess: Date;
}

interface AppConfig {
    name: string;
    description: string;
    welcomeMessage: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundImage: string | null;
    chatOpacity: number;
    logo: string | null;
    botAvatar: string | null;
    browserActions: boolean;
    darkMode: boolean;
}

export interface FrameworkConfig {
    server: {
        port: number;
        ip: string;
        corsEnabled: boolean;
    };
    llm: {
        endpoint: string;
        model: string;
        timeout: number;
        streamTimeout: number;
    };
    openAILLM?: {
        endpoint?: string;
        apiKey?: string;
        model?: string;
        timeout?: number;
        streamTimeout?: number;
    };
    app: AppConfig;
    systemPrompt: string;
    functionPattern: RegExp;
    functions: Record<string, any>;
    auth: {
        enabled: boolean;
        mode: string;
        apiKeys: { enabled: boolean };
    };
    security: {
        allowCommands: boolean;
        allowScripts: boolean;
    };
    examples: {
        enabled: boolean;
        count: number;
    };
    n8n?: {
        endpoint: string;
    };
    chroma?: {
        endpoint: string;
        collectionName: string;
    };
}

class FunctionRegistry {
    private functions = new Map<string, FunctionDefinition>();
    private config: FrameworkConfig;

    constructor(config: FrameworkConfig) {
        this.config = config;
        this.registerBuiltInFunctions();
    }

    private registerBuiltInFunctions() {
        this.register('browser', 'showAlert', {
            handler: async (message: string) => ({ success: true, browserAction: 'alert', data: { message } }),
            parseArgs: (raw: string) => raw.trim(),
            description: 'Show an alert dialog in the browser'
        });

        this.register('browser', 'openWindow', {
            handler: async (url: string) => ({ success: true, browserAction: 'openWindow', data: { url } }),
            parseArgs: (raw: string) => raw.trim(),
            description: 'Open a URL in a new browser window'
        });

        this.register('browser', 'showModal', {
            handler: async (url: string) => ({ success: true, browserAction: 'modal', data: { url } }),
            parseArgs: (raw: string) => raw.trim(),
            description: 'Display a modal with embedded content'
        });

        this.register('browser', 'speak', {
            handler: async (text: string) => ({ success: true, browserAction: 'speak', data: { text } }),
            parseArgs: (raw: string) => raw.trim(),
            description: 'Use text-to-speech to speak text aloud'
        });
    }

    register(type: string, name: string, definition: Partial<FunctionDefinition>) {
        this.functions.set(name, { type, name, ...definition } as FunctionDefinition);
        console.log(`Registered ${type} function: ${name}`);
    }

    registerAPI(name: string, config: any) {
        this.register('api', name, {
            handler: async (args: any) => {
                try {
                    const url = typeof config.endpoint === 'function' ? config.endpoint(args) : config.endpoint;
                    const options: RequestInit = {
                        method: config.method || 'GET',
                        headers: {
                            'User-Agent': 'CorticalAI/2.0',
                            'Accept': 'application/json',
                            ...config.headers
                        },
                        ...(config.body && { body: JSON.stringify(config.body(args)) })
                    };

                    const response = await fetch(url, options);
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

                    const text = await response.text();
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (parseError) {
                        console.warn('Non-JSON response received:', text.substring(0, 200));
                        return { success: false, error: 'Invalid response format' };
                    }

                    return config.transform ? config.transform(data, args) : data;
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description
        });
    }

    registerCommand(name: string, config: any) {
        this.register('command', name, {
            handler: async (args: any) => {
                try {
                    if (!this.config.security?.allowCommands) throw new Error('Command execution is disabled for security');

                    const command = typeof config.command === 'function' ? config.command(args) : config.command;
                    if (config.allowedCommands && !config.allowedCommands.some((cmd: string) => command.startsWith(cmd))) {
                        throw new Error(`Command not allowed: ${command}`);
                    }

                    const { stdout, stderr } = await execAsync(command, {
                        timeout: config.timeout || 10000,
                        maxBuffer: config.maxBuffer || 1024 * 1024
                    });

                    return { success: true, stdout: stdout.toString(), stderr: stderr.toString(), command };
                } catch (error: any) {
                    return { success: false, error: error.message, command: typeof config.command === 'function' ? 'dynamic' : config.command };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description
        });
    }

    registerScript(name: string, config: any) {
        this.register('script', name, {
            handler: async (args: any) => {
                try {
                    if (!this.config.security?.allowScripts) throw new Error('Script execution is disabled for security');

                    const result = await config.handler.call({ args, console, setTimeout, Buffer }, args);
                    return { success: true, result };
                } catch (error: any) {
                    return { success: false, error: error.message, stack: error.stack };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description
        });
    }

    registerN8N(name: string, config: any) {
        this.register('n8n', name, {
            handler: async (args: any) => {
                try {
                    const n8nEndpoint = config.endpoint || this.config.n8n?.endpoint;
                    if (!n8nEndpoint) throw new Error('N8N endpoint not configured');

                    const webhookUrl = `${n8nEndpoint}/webhook/${config.webhookId || name}`;
                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
                        },
                        body: JSON.stringify({ source: 'cortical-ai', timestamp: new Date().toISOString(), data: args })
                    });

                    if (!response.ok) throw new Error(`N8N workflow failed: ${response.status}`);

                    const result = await response.json();
                    return { success: true, workflow: config.webhookId || name, result };
                } catch (error: any) {
                    return { success: false, error: error.message, workflow: config.webhookId || name };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description || `Execute N8N workflow: ${name}`
        });
    }

    registerRAG(name: string, config: any) {
        this.register('rag', name, {
            handler: async (args: any) => {
                try {
                    if (!this.config.chroma?.endpoint) throw new Error('ChromaDB endpoint not configured');
                    if (!this.config.chroma?.collectionName) throw new Error('ChromaDB collection name not configured');

                    const chromaConfig = this.config.chroma;
                    const client = new ChromaClient({ path: chromaConfig.endpoint });
                    const collection = await client.getOrCreateCollection({ name: chromaConfig.collectionName });

                    const queryText = typeof config.query === 'function' ? config.query(args) : args.query;

                    const results = await collection.query({
                        queryTexts: [queryText],
                        nResults: config.nResults || 5,
                    });

                    return { success: true, results: results.documents };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
            parseArgs: config.parseArgs,
            description: config.description || `Retrieve information from ChromaDB: ${name}`
        });
    }

    get(name: string): FunctionDefinition | undefined {
        return this.functions.get(name);
    }

    getAll(): { name: string; type: string; description: string }[] {
        return Array.from(this.functions.values()).map(({ name, type, description }) => ({ name, type, description }));
    }
}

class AuthenticationManager {
    private config: FrameworkConfig;
    private jwtSecret: string;
    public apiKeys = new Map<string, ApiKey>();
    private sessions = new Map<string, Session>();

    constructor(config: FrameworkConfig) {
        this.config = config;
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
        this.generateInitialApiKeys();
    }

    private generateInitialApiKeys() {
        if (!this.config.auth.apiKeys?.enabled) return;

        const adminKey = this.generateApiKey('admin');
        this.apiKeys.set(adminKey, { name: 'Admin Key', role: 'admin', permissions: ['*'], created: new Date() });

        const uiKey = this.generateApiKey('ui');
        this.apiKeys.set(uiKey, { name: 'UI Key', role: 'ui', permissions: ['chat', 'examples', 'functions'], created: new Date() });

        console.log('🔑 API Keys generated - Admin:', adminKey, 'UI:', uiKey);
    }

    private generateApiKey(prefix = 'cai'): string {
        return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
    }

    authenticateRequest(req: Request): { user: any; session?: any; apiKey?: ApiKey } | null {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, this.jwtSecret) as { sessionId: string };
                const session = this.sessions.get(decoded.sessionId);
                if (session) {
                    session.lastAccess = new Date();
                    return { user: session.user, session: decoded };
                }
            } catch (error: any) {
                console.warn('JWT verification failed:', error.message);
            }
        }

        const apiKey = (req.headers['x-api-key'] || req.query.apiKey) as string;
        if (apiKey && this.apiKeys.has(apiKey)) {
            const keyData = this.apiKeys.get(apiKey)!;
            keyData.lastUsed = new Date();
            return { user: { id: 'api', role: keyData.role, name: keyData.name }, apiKey: keyData };
        }

        return null;
    }

    requireAuth(permissions: string[] = []) {
        return (req: Request, res: Response, next: NextFunction) => {
            if (this.config.auth.mode === 'disabled') return next();

            const auth = this.authenticateRequest(req);
            if (!auth) return res.status(401).json({ error: 'Authentication required' });

            (req as any).auth = auth;
            next();
        };
    }
}

class ContextEnhancer {
    private systemInfo: any;

    constructor() {
        this.systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            hostname: os.hostname(),
            memory: { total: Math.round(os.totalmem() / 1e9), free: Math.round(os.freemem() / 1e9) }
        };
    }

    enhanceRequestContext(req: Request | any): any {
        const userAgent = (req.headers && req.headers['user-agent']) || '';
        return {
            timestamp: new Date().toISOString(),
            request: {
                ip: (req.ip || (req.socket && req.socket.remoteAddress)) || 'unknown',
                userAgent,
                browser: this.parseUserAgent(userAgent),
                host: req.headers && req.headers.host,
                method: req.method || 'WebSocket',
                path: req.path || req.url || 'N/A'
            },
            system: this.systemInfo
        };
    }

    private parseUserAgent(userAgent: string): { name: string; os: string } {
        let browser = 'Unknown', os = 'Unknown';
        if (userAgent.includes('Chrome') && !userAgent.includes('Chromium')) browser = 'Chrome';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';

        if (userAgent.includes('Windows NT')) os = 'Windows';
        else if (userAgent.includes('Mac OS X')) os = 'macOS';
        else if (userAgent.includes('Linux')) os = 'Linux';

        return { name: browser, os };
    }

    generateSystemPrompt(basePrompt: string, context: any, user: any = null, ragContext: string | null = null): string {
        const currentTime = new Date().toLocaleString();
        const contextualInfo = `
SYSTEM CONTEXT (Current Session):
- Time: ${currentTime}
- User's Browser: ${context.request.browser.name} on ${context.request.browser.os}
- Server: ${context.system.platform} ${context.system.arch}
${user ? `- User: ${user.email} (${user.role})` : '- Anonymous Session'}
${ragContext ? `
RETRIEVED KNOWLEDGE:
${ragContext}` : ''}

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

class MetricsCollector {
    public chatMessagesCounter: client.Counter;
    public llmResponseTimeHistogram: client.Histogram;
    public functionCallCounter: client.Counter;
    public functionCallDurationHistogram: client.Histogram;

    constructor() {
        client.collectDefaultMetrics();

        this.chatMessagesCounter = new client.Counter({
            name: 'corticalai_chat_messages_total',
            help: 'Total number of chat messages processed',
        });

        this.llmResponseTimeHistogram = new client.Histogram({
            name: 'corticalai_llm_response_time_seconds',
            help: 'Histogram of LLM response times',
            buckets: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50], // 0-50 seconds in 5s increments
        });

        this.functionCallCounter = new client.Counter({
            name: 'corticalai_function_calls_total',
            help: 'Total number of function calls',
            labelNames: ['function_name', 'function_type', 'status'],
        });

        this.functionCallDurationHistogram = new client.Histogram({
            name: 'corticalai_function_call_duration_seconds',
            help: 'Histogram of function call durations',
            labelNames: ['function_name', 'function_type'],
            buckets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // 0-10 seconds in 1s increments
        });
    }

    public getMetrics() {
        return client.register.metrics();
    }
}

export class LLMFramework {
    public app: Express;
    private httpServer: http.Server;
    private io: SocketIOServer;
    private metricsCollector: MetricsCollector;
    private config: FrameworkConfig;
    private functionRegistry: FunctionRegistry;
    private contextEnhancer: ContextEnhancer;
    private authManager: AuthenticationManager | undefined;
    private examplePrompts: string[] = [];

    constructor(config: Partial<FrameworkConfig>) {
        this.config = this.mergeWithDefaults(config as FrameworkConfig);
        this.app = express();
        this.httpServer = http.createServer(this.app);
        this.io = new SocketIOServer(this.httpServer, {
            cors: {
                origin: "*", // Allow all origins for now, refine later
                methods: ["GET", "POST"]
            }
        });
        this.functionRegistry = new FunctionRegistry(this.config);
        this.contextEnhancer = new ContextEnhancer();
        this.metricsCollector = new MetricsCollector();

        this.setupMiddleware();
        this.validateConfiguration();
        this.initializeComponents();
        this.setupWebSockets();
    }

    private setupWebSockets() {
        this.io.on('connection', (socket) => {
            console.log('WebSocket client connected', socket.id);

            socket.on('disconnect', () => {
                console.log('WebSocket client disconnected', socket.id);
            });

            socket.on('chatMessage', async (message: string, callback: (response: any) => void) => {
                this.metricsCollector.chatMessagesCounter.inc();
                const context = this.contextEnhancer.enhanceRequestContext(socket.request);

                try {
                    const functionCall = this.detectFunctionCall(message);
                    let ragContext: string | null = null;

                    if (functionCall && this.functionRegistry.get(functionCall.function)?.type === 'rag') {
                        socket.emit('llmToken', { type: "status", text: "Retrieving knowledge..." });
                        try {
                            const func = this.functionRegistry.get(functionCall.function);
                            if (!func) throw new Error(`Function ${functionCall.function} not found`);
                            const result = await func.handler(functionCall.args);
                            if (result.success && result.results) {
                                ragContext = result.results.join('\n\n');
                                socket.emit('llmToken', { type: "status", text: "Knowledge retrieved." });
                            } else if (result.error) {
                                socket.emit('llmToken', { type: "error", error: `RAG Error: ${result.error}` });
                            }
                        } catch (error: any) {
                            socket.emit('llmToken', { type: "error", error: `RAG Function Error: ${error.message}` });
                        }
                    }

                    const systemPrompt = this.contextEnhancer.generateSystemPrompt(this.config.systemPrompt, context, null, ragContext);
                    const fullPrompt = `${systemPrompt}\n\nUser says: "${message}"\n\nAssistant responds: `;

                    if (functionCall && this.functionRegistry.get(functionCall.function)?.type !== 'rag') {
                        const funcName = functionCall.function;
                        const funcType = this.functionRegistry.get(funcName)?.type || 'unknown';
                        const end = this.metricsCollector.functionCallDurationHistogram.startTimer({ function_name: funcName, function_type: funcType });
                        socket.emit('llmToken', { type: "status", text: "Processing your request..." });
                        try {
                            const func = this.functionRegistry.get(functionCall.function);
                            if (!func) throw new Error(`Function ${functionCall.function} not found`);

                            const result = await func.handler(functionCall.args);
                            if (result.success && result.browserAction) {
                                socket.emit('llmToken', { type: "browser_action", action: result.browserAction, data: result.data });
                                socket.emit('llmToken', { type: "token", text: this.getBrowserActionConfirmation(result.browserAction, result.data) });
                                this.metricsCollector.functionCallCounter.inc({ function_name: funcName, function_type: funcType, status: 'success' });
                            } else if (result.results || result.success) {
                                socket.emit('llmToken', { type: "function_result", data: result });
                                this.metricsCollector.functionCallCounter.inc({ function_name: funcName, function_type: funcType, status: 'success' });
                            }
                            socket.emit('llmToken', { type: "done" });
                            end();
                        } catch (error: any) {
                            socket.emit('llmToken', { type: "error", error: error.message });
                            this.metricsCollector.functionCallCounter.inc({ function_name: funcName, function_type: funcType, status: 'error' });
                            end();
                        }
                    } else if (!functionCall || (functionCall && this.functionRegistry.get(functionCall.function)?.type === 'rag' && ragContext)) {
                        if (this.config.openAILLM?.endpoint) {
                            await this.streamOpenAILLMResponse([{ role: 'system', content: systemPrompt }, { role: 'user', content: message }], socket);
                        } else {
                            await this.streamLLMResponse(fullPrompt, socket);
                        }
                    }
                } catch (error: any) {
                    console.error("WebSocket chat error:", error);
                    socket.emit('llmToken', { type: "error", error: error.message });
                }
                if (callback) callback({ status: 'processed' });
            });
        });
    }

    private initializeComponents() {
        if (this.config.auth?.enabled) {
            this.authManager = new AuthenticationManager(this.config);
        }
        this.registerUserFunctions();
        this.setupSwaggerDocs();
    }

    private registerUserFunctions() {
        const { functions = {} } = this.config;
        Object.entries(functions).forEach(([name, definition]) => {
            switch (definition.type) {
                case 'api': this.functionRegistry.registerAPI(name, definition); break;
                case 'command': this.functionRegistry.registerCommand(name, definition); break;
                case 'script': this.functionRegistry.registerScript(name, definition); break;
                case 'n8n': this.functionRegistry.registerN8N(name, definition); break;
                case 'rag': this.functionRegistry.registerRAG(name, definition); break;
                default: console.warn(`Unknown function type: ${definition.type || '(none)'}`);
            }
        });
    }

    private setupSwaggerDocs() {
        const swaggerOptions = {
            definition: {
                openapi: '3.0.0',
                info: { title: `${this.config.app.name} API`, version: '2.0.0', description: `API for ${this.config.app.description}` },
                servers: [{ url: `http://${this.config.server.ip}:${this.config.server.port}`, description: 'Development server' }]
            },
            apis: []
        };
        const swaggerSpec = swaggerJsdoc(swaggerOptions);
        this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        console.log(`📚 API Documentation: http://${this.config.server.ip}:${this.config.server.port}/api/docs`);
    }

    private mergeWithDefaults(config: FrameworkConfig): FrameworkConfig {
        const defaults: FrameworkConfig = {
            server: { port: 3001, ip: "localhost", corsEnabled: true },
            llm: { endpoint: "http://localhost:11434/api/generate", model: "gemma3:1b", timeout: 900000, streamTimeout: 1200000 },
            openAILLM: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-3.5-turbo", timeout: 900000, streamTimeout: 1200000 },
            app: { name: "AI Assistant", description: "AI-powered assistant", welcomeMessage: "Hello! How can I help you today?", primaryColor: "#007bff", secondaryColor: "#6c757d", backgroundImage: null, chatOpacity: 0.95, logo: null, botAvatar: null, browserActions: true, darkMode: false },
            systemPrompt: '',
            functionPattern: /^FUNCTION:(\w+):(.+)$/,
            functions: {},
            auth: { enabled: false, mode: 'disabled', apiKeys: { enabled: true } },
            security: { allowCommands: false, allowScripts: false },
            examples: { enabled: true, count: 6 }
        };
        // Simple deep merge, can be improved
        return {
            ...defaults,
            ...config,
            server: { ...defaults.server, ...config.server },
            llm: { ...defaults.llm, ...config.llm },
            openAILLM: { ...defaults.openAILLM, ...config.openAILLM },
            app: { ...defaults.app, ...config.app },
            auth: { ...defaults.auth, ...config.auth },
            security: { ...defaults.security, ...config.security },
            examples: { ...defaults.examples, ...config.examples },
            chroma: config.chroma ? { ...config.chroma } : undefined,
            n8n: config.n8n ? { ...config.n8n } : undefined
        };
    }

    private setupMiddleware() {
        this.app.use(bodyParser.json());
        this.app.set('trust proxy', true);
        if (this.config.server.corsEnabled) {
            this.app.use((req: Request, res: Response, next: NextFunction) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
                if (req.method === 'OPTIONS') res.sendStatus(200); else next();
            });
        }
    }

    private validateConfiguration() {
        if (!this.config.systemPrompt) throw new Error('Missing required config: systemPrompt');
        console.log('✅ Configuration validated successfully');
    }

    private detectFunctionCall(text: string): { function: string; args: any } | null {
        const match = text.trim().match(this.config.functionPattern);
        if (!match) return null;

        const [, funcName, rawArgs] = match;
        const func = this.functionRegistry.get(funcName);
        if (!func) return null;

        try {
            return { function: funcName, args: func.parseArgs(rawArgs) };
        } catch (error) {
            console.error(`Error parsing args for ${funcName}:`, error);
            return null;
        }
    }

    private getBrowserActionConfirmation(action: string, data: any): string {
        const confirmations: Record<string, string> = {
            alert: `Alert displayed: "${data.message}"`, 
            openWindow: `Opening new tab: ${data.url}`,
            modal: `Opening modal with: ${data.url}`,
            speak: `Speaking: "${data.text}"`
        };
        return confirmations[action] || `Browser action completed: ${action}`;
    }

    private async streamLLMResponse(prompt: string, socket: any) {
        const end = this.metricsCollector.llmResponseTimeHistogram.startTimer();
        const response = await fetch(this.config.llm.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: this.config.llm.model, prompt, stream: true })
        });

        if (!response.ok) {
            end(); // End timer even on error
            throw new Error(`LLM API error: ${response.status}`);
        }

        return new Promise<void>((resolve, reject) => {
            if (!response.body) {
                end(); // End timer even on error
                reject(new Error('Response body is null'));
                return;
            }
            response.body.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.response) socket.emit('llmToken', { type: "token", text: parsed.response });
                            if (parsed.done) {
                                socket.emit('llmToken', { type: "done" });
                                end(); // End timer on successful completion
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
                socket.emit('llmToken', { type: "done" });
                end(); // End timer on stream end
                resolve();
            });
            response.body.on('error', (err) => {
                end(); // End timer on error
                reject(err);
            });
        });
    }

    private async streamOpenAILLMResponse(messages: Array<{ role: string; content: string }>, socket: any) {
        const end = this.metricsCollector.llmResponseTimeHistogram.startTimer();
        const openAILLMConfig = this.config.openAILLM;
        if (!openAILLMConfig || !openAILLMConfig.endpoint) {
            end(); // End timer even on error
            throw new Error("OpenAI LLM endpoint not configured.");
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (openAILLMConfig.apiKey) {
            headers["Authorization"] = `Bearer ${openAILLMConfig.apiKey}`;
        }

        const body = JSON.stringify({
            model: openAILLMConfig.model,
            messages: messages,
            stream: true,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), openAILLMConfig.streamTimeout);

        const response = await fetch(openAILLMConfig.endpoint, {
            method: "POST",
            headers: headers,
            body: body,
            signal: controller.signal, // Use the signal from AbortController
        });

        clearTimeout(timeoutId); // Clear timeout if fetch completes before timeout

        if (!response.ok) {
            end(); // End timer even on error
            const errorText = await response.text();
            throw new Error(`OpenAI LLM API error: ${response.status} - ${errorText}`);
        }

        return new Promise<void>((resolve, reject) => {
            if (!response.body) {
                end(); // End timer even on error
                reject(new Error('Response body is null'));
                return;
            }

            response.body.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.trim() === 'data: [DONE]') {
                        socket.emit('llmToken', { type: "done" });
                        end(); // End timer on successful completion
                        resolve();
                        return;
                    }
                    if (line.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(line.substring(6));
                            if (parsed.choices && parsed.choices.length > 0) {
                                const delta = parsed.choices[0].delta;
                                if (delta.content) {
                                    socket.emit('llmToken', { type: "token", text: delta.content });
                                }
                            }
                        } catch (e) {
                            console.error('Parse error:', e);
                        }
                    }
                }
            });

            response.body.on('end', () => {
                socket.emit('llmToken', { type: "done" });
                end(); // End timer on stream end
                resolve();
            });

            response.body.on('error', (err) => {
                end(); // End timer on error
                reject(err);
            });
        });
    }

    public setupRoutes() {


        this.app.post("/api/v1/chat/stream", this.authManager?.requireAuth(['chat']) || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {

            const { message } = req.body;

            const context = this.contextEnhancer.enhanceRequestContext(req);



            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });



            try {

                const functionCall = this.detectFunctionCall(message);

                let ragContext: string | null = null;



                // If a RAG function is explicitly called, execute it

                if (functionCall && this.functionRegistry.get(functionCall.function)?.type === 'rag') {

                    res.write(`data: ${JSON.stringify({ type: "status", text: "Retrieving knowledge..." })}\n\n`);

                    try {

                        const func = this.functionRegistry.get(functionCall.function);

                        if (!func) throw new Error(`Function ${functionCall.function} not found`);

                        const result = await func.handler(functionCall.args);

                        if (result.success && result.results) {

                            ragContext = result.results.join('\n\n'); // Join retrieved documents

                            res.write(`data: ${JSON.stringify({ type: "status", text: "Knowledge retrieved." })}\n\n`);

                        } else if (result.error) {

                            res.write(`data: ${JSON.stringify({ type: "error", error: `RAG Error: ${result.error}` })}\n\n`);

                        }

                    } catch (error: any) {

                        res.write(`data: ${JSON.stringify({ type: "error", error: `RAG Function Error: ${error.message}` })}\n\n`);

                    }

                }



                const systemPrompt = this.contextEnhancer.generateSystemPrompt(this.config.systemPrompt, context, (req as any).auth?.user, ragContext);

                const fullPrompt = `${systemPrompt}\n\nUser says: "${message}"\n\nAssistant responds: `;



                if (functionCall && this.functionRegistry.get(functionCall.function)?.type !== 'rag') {

                    res.write(`data: ${JSON.stringify({ type: "status", text: "Processing your request..." })}\n\n`);

                    try {

                        const func = this.functionRegistry.get(functionCall.function);

                        if (!func) throw new Error(`Function ${functionCall.function} not found`);



                        const result = await func.handler(functionCall.args);

                        if (result.success && result.browserAction) {

                            res.write(`data: ${JSON.stringify({ type: "browser_action", action: result.browserAction, data: result.data })}\n\n`);

                            res.write(`data: ${JSON.stringify({ type: "token", text: this.getBrowserActionConfirmation(result.browserAction, result.data) })}\n\n`);

                        } else if (result.results || result.success) {

                            res.write(`data: ${JSON.stringify({ type: "function_result", data: result })}\n\n`);

                        }

                        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);

                        res.end();

                    } catch (error: any) {

                        res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);

                        res.end();

                    }

                } else if (!functionCall || (functionCall && this.functionRegistry.get(functionCall.function)?.type === 'rag' && ragContext)) {

                    await this.streamLLMResponse(fullPrompt, res);

                }

            } catch (error: any) {

                console.error("Chat error:", error);

                res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);

                res.end();

            }

        });



        /**

         * @swagger

         * /api/v1/chat/completions:

         *   post:

         *     summary: Get chat completions from an OpenAPI-compatible LLM.

         *     description: Sends a list of messages to a configurable OpenAPI-compatible LLM and streams back the response.

         *     tags:

         *       - Chat

         *     requestBody:

         *       required: true

         *       content:

         *         application/json:

         *           schema:

         *             type: object

         *             required:

         *               - messages

         *             properties:

         *               messages:

         *                 type: array

         *                 items:

         *                   type: object

         *                   properties:

         *                     role:

         *                       type: string

         *                       enum: [system, user, assistant]

         *                       description: The role of the message sender.

         *                     content:

         *                       type: string

         *                       description: The content of the message.

         *                 description: A list of messages comprising the conversation so far.

         *     responses:

         *       200: 

         *         description: A stream of chat completion tokens.

         *         content:

         *           text/event-stream:

         *             schema:

         *               type: string

         *               example: "data: {\"type\":\"token\",\"text\":\"Hello\"}\n\ndata: {\"type\":\"done\"}\n\n"

         *       401:

         *         description: Authentication required if enabled.

         *       500:

         *         description: Internal server error.

         */

        this.app.post("/api/v1/chat/completions", this.authManager?.requireAuth(['chat']) || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {

            const { messages } = req.body;

            if (!messages || !Array.isArray(messages)) {

                return res.status(400).json({ error: "Messages array is required." });

            }



            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });



            try {

                if (this.config.openAILLM?.endpoint) {

                    await this.streamOpenAILLMResponse(messages, res);

                } else {

                    // Fallback to existing LLM if OpenAPI endpoint is not configured

                    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';

                    const userMessage = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');

                    const assistantMessage = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');



                    let fullPrompt = systemPrompt;

                    if (userMessage) fullPrompt += `\n\nUser says: "${userMessage}"`;

                    if (assistantMessage) fullPrompt += `\n\nAssistant responds: "${assistantMessage}"`;

                    fullPrompt += `\n\nAssistant responds: `; // To prompt the assistant for a response



                    await this.streamLLMResponse(fullPrompt, res);

                }

            } catch (error: any) {

                console.error("OpenAPI chat completions error:", error);

                res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);

                res.end();

            }

        });



        /**

         * @swagger

         * /api/v1/config:

         *   get:

         *     summary: Get public application configuration.

         *     description: Returns public configuration details of the application, including app name, function count, and authentication status.

         *     tags:

         *       - Configuration

         *     responses:

         *       200:

         *         description: Public configuration details.

         *         content:

         *           application/json:

         *             schema:

         *               type: object

         *               properties:

         *                 success:

         *                   type: boolean

         *                   example: true

         *                 config:

         *                   type: object

         *                   properties:

         *                     app:

         *                       type: object

         *                       description: Application details.

         *                     functions: 

         *                       type: number

         *                       description: Number of registered functions.

         *                     auth:

         *                       type: object

         *                       properties:

         *                         enabled:

         *                           type: boolean

         *                           description: Authentication enabled status.

         *       401:

         *         description: Authentication required if enabled.

         */
        /**
         * @swagger
         * /api/v1/config:
         *   get:
         *     summary: Get public application configuration.
         *     description: Returns public configuration details of the application, including app name, function count, and authentication status.
         *     tags:
         *       - Configuration
         *     responses:
         *       200:
         *         description: Public configuration details.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: true
         *                 config:
         *                   type: object
         *                   properties:
         *                     app:
         *                       type: object
         *                       description: Application details.
         *                     functions:
         *                       type: number
         *                       description: Number of registered functions.
         *                     auth:
         *                       type: object
         *                       properties:
         *                         enabled:
         *                           type: boolean
         *                           description: Authentication enabled status.
         *       401:
         *         description: Authentication required if enabled.
         */
        this.app.get("/api/v1/config", this.authManager?.requireAuth(['config']) || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
            const publicConfig = {
                app: this.config.app,
                functions: this.functionRegistry.getAll().length,
                auth: { enabled: this.config.auth?.enabled || false }
            };
            res.json({ success: true, config: publicConfig });
        });

        /**
         * @swagger
         * /api/v1/functions:
         *   get:
         *     summary: Get a list of available functions.
         *     description: Returns a list of all registered functions, including their names, types, and descriptions.
         *     tags:
         *       - Functions
         *     responses:
         *       200:
         *         description: An array of function definitions.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 functions:
         *                   type: array
         *                   items:
         *                     type: object
         *                     properties:
         *                       name:
         *                         type: string
         *                       type:
         *                         type: string
         *                       description:
         *                         type: string
         *                 total:
         *                   type: number
         *       401:
         *         description: Authentication required if enabled.
         */
        this.app.get("/api/v1/functions", this.authManager?.requireAuth(['functions']) || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
            const functions = this.functionRegistry.getAll();
            res.json({ functions, total: functions.length });
        });

        this.app.get("/examples", async (req: Request, res: Response) => {
            try {
                if (this.examplePrompts.length === 0) {
                    this.examplePrompts = ['Hello, what can you help me with?', 'Tell me about your capabilities', 'What functions do you have available?', 'Help me get started'];
                }
                res.json({ success: true, examples: this.examplePrompts });
            } catch (error) {
                res.json({ success: false, examples: this.examplePrompts });
            }
        });

        if (process.env.NODE_ENV === 'production') {
            this.app.use(express.static('build'));
            this.app.get("*", (req: Request, res: Response) => {
                // Production serving of React app - requires fs and path, which are not ideal in this context.
                // This part would need a refactor to not use fs/path directly in a web context if it were to be isomorphic.
                res.status(501).send("Production serving of frontend not implemented in this refactoring.");
            });
        } else {
            this.app.get("/", (req: Request, res: Response) => {
                const apiKey = this.authManager?.apiKeys ? Array.from(this.authManager.apiKeys.keys()).find(key => this.authManager!.apiKeys.get(key)!.role === 'ui') : null;
                res.json({
                    message: "CorticalAI v2.0 API Server",
                    development: true,
                    react_frontend: "Start React dev server separately on port 3000",
                    api_docs: `http://${this.config.server.ip}:${this.config.server.port}/api/docs`,
                    config: { apiUrl: `http://${this.config.server.ip}:${this.config.server.port}`, apiKey, app: this.config.app }
                });
            });
        }

        /**
         * @swagger
         * /api/v1/health:
         *   get:
         *     summary: Health check endpoint.
         *     description: Returns the current status of the API, including application name, version, and system information.
         *     tags:
         *       - Monitoring
         *     responses:
         *       200:
         *         description: API is healthy.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   example: ok
         *                 app:
         *                   type: string
         *                 version:
         *                   type: string
         *                 features:
         *                   type: object
         *                   properties:
         *                     functions:
         *                       type: number
         *                     auth:
         *                       type: boolean
         *                     ui:
         *                       type: boolean
         *                 system:
         *                   type: object
         *                 timestamp:
         *                   type: string
         *                   format: date-time
         */
        this.app.get("/api/v1/health", (req: Request, res: Response) => {
            const context = this.contextEnhancer.enhanceRequestContext(req);
            res.json({ status: "ok", app: this.config.app.name, version: "2.0.0", features: { functions: this.functionRegistry.getAll().length, auth: !!this.authManager, ui: process.env.DISABLE_DEFAULT_UI !== 'true' }, system: context.system, timestamp: new Date().toISOString() });
        });

        this.app.get("/metrics", async (req: Request, res: Response) => {
            res.set('Content-Type', client.register.contentType);
            res.end(await this.metricsCollector.getMetrics());
        });
    }

    public async start() {
        this.setupRoutes();
        this.httpServer.listen(this.config.server.port, this.config.server.ip, () => {
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
