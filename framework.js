import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { generateUI } from "./ui.js";

// =============================================================================
// FRAMEWORK CORE - The reusable LLM orchestrator
// =============================================================================

export class LLMFramework {
    constructor(config) {
        this.config = this.mergeWithDefaults(config);
        this.app = express();
        this.examplePrompts = []; // Cache for generated examples
        this.setupMiddleware();
        this.validateConfiguration();
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
                navigationLinks: this.parseNavigationLinks(process.env.APP_NAVIGATION_LINKS),
                browserActions: process.env.APP_BROWSER_ACTIONS !== 'false'
            },
            functionPattern: new RegExp(process.env.APP_FUNCTION_PATTERN || "^FUNCTION:(\\w+):(.+)$"),
            functions: {},
            // Example generation settings
            examples: {
                enabled: process.env.APP_EXAMPLES_ENABLED !== 'false',
                count: parseInt(process.env.APP_EXAMPLES_COUNT) || 6,
                regenerateOnStart: process.env.APP_EXAMPLES_REGENERATE !== 'false'
            }
        };

        return this.deepMerge(defaults, config);
    }

    parseNavigationLinks(envValue) {
        if (!envValue) return null;

        try {
            // Expected format: "Home|/,About|/about,Contact|https://example.com|true"
            // Format: text|url|external(optional, defaults to true for https://)
            return envValue.split(',').map(link => {
                const parts = link.trim().split('|');
                if (parts.length < 2) return null;

                const [text, url, external] = parts;
                return {
                    text: text.trim(),
                    url: url.trim(),
                    external: external !== undefined ? external === 'true' : url.startsWith('http')
                };
            }).filter(link => link !== null);
        } catch (error) {
            console.warn('Failed to parse navigation links:', error);
            return null;
        }
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

        if (this.config.server.corsEnabled) {
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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
                throw new Error(`Missing required config section: ${section} `);
            }
        }

        // Validate functions
        for (const [funcName, funcDef] of Object.entries(this.config.functions || {})) {
            if (!funcDef.handler || typeof funcDef.handler !== 'function') {
                throw new Error(`Function ${funcName} missing handler or handler is not a function`);
            }
            if (!funcDef.parseArgs || typeof funcDef.parseArgs !== 'function') {
                throw new Error(`Function ${funcName} missing parseArgs method`);
            }
        }

        // Auto-register browser functions if enabled
        if (this.config.app.browserActions) {
            this.registerBrowserFunctions();
        }

        console.log('✅ Configuration validated successfully');
    }

    registerBrowserFunctions() {
        const browserFunctions = {
            showAlert: {
                handler: async (message) => {
                    return {
                        success: true,
                        browserAction: 'alert',
                        data: { message }
                    };
                },
                parseArgs: (rawArgs) => rawArgs.trim()
            },
            openWindow: {
                handler: async (url) => {
                    return {
                        success: true,
                        browserAction: 'openWindow',
                        data: { url }
                    };
                },
                parseArgs: (rawArgs) => rawArgs.trim()
            },
            showModal: {
                handler: async (url) => {
                    return {
                        success: true,
                        browserAction: 'modal',
                        data: { url }
                    };
                },
                parseArgs: (rawArgs) => rawArgs.trim()
            },
            speak: {
                handler: async (text) => {
                    return {
                        success: true,
                        browserAction: 'speak',
                        data: { text }
                    };
                },
                parseArgs: (rawArgs) => rawArgs.trim()
            }
        };

        // Merge browser functions with user-defined functions
        this.config.functions = { ...this.config.functions, ...browserFunctions };
        console.log(`🌐 Registered ${Object.keys(browserFunctions).length} browser functions`);
    }

    getBrowserActionConfirmation(action, data) {
        switch (action) {
            case 'alert':
                return `Alert displayed: "${data.message}"`;
            case 'openWindow':
                return `Opening new tab: ${data.url}`;
            case 'modal':
                return `Opening modal with: ${data.url}`;
            case 'speak':
                return `Speaking: "${data.text}"`;
            default:
                return `Browser action completed: ${action}`;
        }
    }

    // Generate example prompts using the LLM
    async generateExamplePrompts() {
        if (!this.config.examples.enabled) {
            return ['Hello', 'What can you help me with?'];
        }

        try {
            const functionNames = Object.keys(this.config.functions);
            const hasFunction = functionNames.length > 0;

            let examplePrompt = `You are ${this.config.app.name}. ${this.config.app.description}

Based on your capabilities, generate ${this.config.examples.count} example questions or requests that users might ask you. 

${hasFunction ? `You have these functions available: ${functionNames.join(', ')}` : 'You are a conversational assistant.'}

Return ONLY a JSON array of strings, no other text. Each string should be a realistic user question or request that you can handle well.

Example format: ["Question 1", "Question 2", "Question 3"]

Generate varied examples that show different aspects of what you can do:`;

            console.log('🔄 Generating example prompts...');

            const response = await fetch(this.config.llm.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.config.llm.model,
                    prompt: examplePrompt,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`LLM API error: ${response.status}`);
            }

            const data = await response.json();
            const responseText = data.response.trim();

            console.log('🤖 Raw LLM response for examples:', responseText);

            // Try to extract JSON from the response
            let examples;
            try {
                // Look for JSON array in the response
                const jsonMatch = responseText.match(/\[(.*?)\]/s);
                if (jsonMatch) {
                    examples = JSON.parse(jsonMatch[0]);
                } else {
                    // Try parsing the whole response as JSON
                    examples = JSON.parse(responseText);
                }
            } catch (parseError) {
                console.warn('⚠️ Failed to parse LLM response as JSON, using fallback examples');
                examples = this.getFallbackExamples();
            }

            // Validate and clean examples
            if (Array.isArray(examples) && examples.length > 0) {
                this.examplePrompts = examples
                    .filter(ex => typeof ex === 'string' && ex.trim().length > 0)
                    .map(ex => ex.trim())
                    .slice(0, this.config.examples.count);

                console.log('✅ Generated examples:', this.examplePrompts);
                return this.examplePrompts;
            } else {
                throw new Error('Invalid examples format from LLM');
            }

        } catch (error) {
            console.error('❌ Failed to generate examples:', error);
            this.examplePrompts = this.getFallbackExamples();
            return this.examplePrompts;
        }
    }

    getFallbackExamples() {
        const functionNames = Object.keys(this.config.functions);

        if (functionNames.length > 0) {
            return [
                'Hello, what can you help me with?',
                `Can you use your ${functionNames[0]} function?`,
                'Tell me about your capabilities',
                'What functions do you have available?',
                'Help me get started',
                'Show me what you can do'
            ];
        } else {
            return [
                'Hello, how are you?',
                'What can you help me with today?',
                'Tell me something interesting',
                'How can I get started?',
                'What are your capabilities?',
                'Can you assist me with questions?'
            ];
        }
    }

    detectFunctionCall(text) {
        if (!text) return null;

        const trimmedText = text.trim();
        console.log('=== FUNCTION DETECTION DEBUG ===');
        console.log('Text to check:', JSON.stringify(trimmedText));
        console.log('Pattern:', this.config.functionPattern);

        const match = trimmedText.match(this.config.functionPattern);
        console.log('Match result:', match);

        if (match) {
            const [fullMatch, funcName, rawArgs] = match;
            console.log('Function call found:', funcName, 'with args:', rawArgs);

            if (this.config.functions[funcName]) {
                try {
                    const args = this.config.functions[funcName].parseArgs(rawArgs);
                    return { function: funcName, args };
                } catch (error) {
                    console.error(`Error parsing args for ${funcName}: `, error);
                    return null;
                }
            } else {
                console.error(`Function ${funcName} not found in config`);
            }
        } else {
            console.log('NO MATCH FOUND');
        }

        return null;
    }

    async executeFunction(funcName, args) {
        const funcDef = this.config.functions[funcName];
        if (!funcDef) {
            throw new Error(`Function ${funcName} not found`);
        }

        if (funcDef.validation) {
            this.validateFunctionArgs(funcName, args, funcDef.validation);
        }

        return await funcDef.handler(args);
    }

    validateFunctionArgs(funcName, args, validation) {
        if (validation.required) {
            for (const required of validation.required) {
                if (args[required] === undefined || args[required] === null) {
                    throw new Error(`Function ${funcName} missing required parameter: ${required} `);
                }
            }
        }

        if (validation.types) {
            for (const [param, expectedType] of Object.entries(validation.types)) {
                if (args[param] !== undefined && typeof args[param] !== expectedType) {
                    throw new Error(`Function ${funcName} parameter ${param} should be ${expectedType}, got ${typeof args[param]} `);
                }
            }
        }
    }

    async processOllamaStream(response, res) {
        return new Promise((resolve, reject) => {
            let buffer = "";

            const timeout = setTimeout(() => {
                console.log('Stream timeout');
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({
                        type: "error",
                        error: "Response timeout"
                    })
                        } \n\n`);
                    res.end();
                }
                reject(new Error('Timeout'));
            }, this.config.llm.streamTimeout);

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
                                })
                                    } \n\n`);
                            }
                            if (parsed.done) {
                                clearTimeout(timeout);
                                res.write(`data: ${JSON.stringify({ type: "done" })} \n\n`);
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
                clearTimeout(timeout);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: "done" })} \n\n`);
                    res.end();
                }
                resolve();
            });

            response.body.on('error', (error) => {
                clearTimeout(timeout);
                console.error('Stream error:', error);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({
                        type: "error",
                        error: error.message
                    })
                        } \n\n`);
                    res.end();
                }
                reject(error);
            });
        });
    }

    setupRoutes() {
        this.app.post("/stream", async (req, res) => {
            const { message, conversationHistory = [] } = req.body;
            console.log("Request:", message);

            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            });

            req.setTimeout(this.config.llm.streamTimeout);
            res.setTimeout(this.config.llm.streamTimeout);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.llm.timeout);

                const initialResponse = await fetch(this.config.llm.endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: this.config.llm.model,
                        prompt: `${this.config.systemPrompt}

User says: "${message}"

Assistant responds: `,
                        stream: false
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!initialResponse.ok) {
                    throw new Error(`LLM API error: ${initialResponse.status} `);
                }

                const initialData = await initialResponse.json();
                const responseText = initialData.response;

                console.log("LLM response:", responseText);

                const functionCall = this.detectFunctionCall(responseText);

                if (functionCall) {
                    console.log("Function call detected:", functionCall);

                    res.write(`data: ${JSON.stringify({
                        type: "status",
                        text: "Processing your request..."
                    })
                        } \n\n`);

                    try {
                        const result = await this.executeFunction(functionCall.function, functionCall.args);
                        console.log('Function result:', result);

                        // Handle different result types
                        if (result.success && result.browserAction) {
                            // Send browser action to frontend
                            res.write(`data: ${JSON.stringify({
                                type: "browser_action",
                                action: result.browserAction,
                                data: result.data
                            })} \n\n`);

                            // Send confirmation message
                            res.write(`data: ${JSON.stringify({
                                type: "token",
                                text: this.getBrowserActionConfirmation(result.browserAction, result.data)
                            })} \n\n`);

                            res.write(`data: ${JSON.stringify({ type: "done" })} \n\n`);
                            res.end();
                            return;
                        } else if (result.success && result.results) {
                            res.write(`data: ${JSON.stringify({
                                type: "search_results",
                                results: result.results,
                                totalResults: result.totalResults
                            })
                                } \n\n`);
                        } else if (result.success && result.data) {
                            res.write(`data: ${JSON.stringify({
                                type: "function_result",
                                data: result.data
                            })
                                } \n\n`);
                        } else if (!result.success) {
                            // Handle failed function calls
                            res.write(`data: ${JSON.stringify({
                                type: "error",
                                error: result.message || result.error || "Function execution failed"
                            })
                                } \n\n`);
                            res.end();
                            return;
                        }

                        // Get AI interpretation of results
                        let analysisPrompt;
                        if (result.success && result.results) {
                            const topResults = result.results.slice(0, 3);
                            analysisPrompt = `User searched for: "${message}"

Found ${result.totalResults} results! Top matches:
${topResults.map(r => `- "${r.name}" by ${r.artist}`).join('\n')}

Write a brief, helpful response about these search results.`;
                        } else {
                            analysisPrompt = `User searched for: "${message}" but no results were found.Suggest trying different keywords.`;
                        }

                        const analysisResponse = await fetch(this.config.llm.endpoint, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                model: this.config.llm.model,
                                prompt: analysisPrompt,
                                stream: true
                            })
                        });

                        if (analysisResponse.ok) {
                            await this.processOllamaStream(analysisResponse, res);
                        } else {
                            throw new Error(`Analysis failed: ${analysisResponse.status} `);
                        }

                    } catch (error) {
                        console.error('Function error:', error);
                        res.write(`data: ${JSON.stringify({
                            type: "error",
                            error: `Function failed: ${error.message}`
                        })
                            } \n\n`);
                        res.end();
                    }

                } else {
                    // No function call detected, stream normal response
                    const streamResponse = await fetch(this.config.llm.endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: this.config.llm.model,
                            prompt: `${this.config.systemPrompt}

User says: ${message}

Assistant responds: `,
                            stream: true
                        })
                    });

                    if (streamResponse.ok) {
                        await this.processOllamaStream(streamResponse, res);
                    } else {
                        throw new Error(`Stream failed: ${streamResponse.status} `);
                    }
                }

            } catch (error) {
                console.error("Stream error:", error);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({
                        type: "error",
                        error: error.name === 'AbortError' ? 'Request timeout' : error.message
                    })
                        } \n\n`);
                    res.end();
                }
            }
        });

        // Examples endpoint
        this.app.get("/examples", async (req, res) => {
            try {
                if (this.examplePrompts.length === 0 || this.config.examples.regenerateOnStart) {
                    await this.generateExamplePrompts();
                }

                res.json({
                    success: true,
                    examples: this.examplePrompts
                });
            } catch (error) {
                console.error('Failed to get examples:', error);
                res.json({
                    success: false,
                    examples: this.getFallbackExamples()
                });
            }
        });

        this.app.get("/", (req, res) => {
            res.send(generateUI(this.config));
        });

        // Health check endpoint
        this.app.get("/health", (req, res) => {
            res.json({
                status: "ok",
                app: this.config.app.name,
                functions: Object.keys(this.config.functions).length,
                examples: this.examplePrompts.length,
                timestamp: new Date().toISOString()
            });
        });
    }

    async start() {
        this.setupRoutes();

        // Generate examples on startup if enabled
        if (this.config.examples.enabled) {
            this.generateExamplePrompts().catch(console.error);
        }

        this.app.listen(this.config.server.port, this.config.server.ip, () => {
            console.log(`
╔════════════════════════════════════════════════════════════════╗
║   ${this.config.app.name.padEnd(58)} ║
╠════════════════════════════════════════════════════════════════╣
║  🚀 Server: http://${this.config.server.ip}:${this.config.server.port}                               ║
║  🤖 Model: ${this.config.llm.model.padEnd(49)} ║
║  ⚡ Functions: ${Object.keys(this.config.functions).length.toString().padEnd(44)} ║
║  💡 Examples: ${this.config.examples.enabled ? 'Enabled' : 'Disabled'}                                     ║
║  🌐 Browser Actions: ${this.config.app.browserActions ? 'Enabled' : 'Disabled'}                            ║
║  ✅ Status: Ready                                              ║
╚════════════════════════════════════════════════════════════════╝
        `);
        });
    }
}