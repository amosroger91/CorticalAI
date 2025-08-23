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
                secondaryColor: `#${process.env.APP_SECONDARYCOLOR}` || "#6c757d"
            },
            functionPattern: new RegExp(process.env.APP_FUNCTION_PATTERN || "^FUNCTION:(\\w+):(.+)$"),
            functions: {}
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

        console.log('✅ Configuration validated successfully');
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
                        if (result.success && result.results) {
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

        this.app.get("/", (req, res) => {
            res.send(generateUI(this.config));
        });

        // Health check endpoint
        this.app.get("/health", (req, res) => {
            res.json({
                status: "ok",
                app: this.config.app.name,
                functions: Object.keys(this.config.functions).length,
                timestamp: new Date().toISOString()
            });
        });
    }

    start() {
        this.setupRoutes();
        this.app.listen(this.config.server.port, this.config.server.ip, () => {
            console.log(`
╔════════════════════════════════════════════════════════════════╗
║   ${this.config.app.name.padEnd(58)} ║
╠════════════════════════════════════════════════════════════════╣
║  🚀 Server: http://${this.config.server.ip}:${this.config.server.port}                               ║
║  🤖 Model: ${this.config.llm.model.padEnd(49)} ║
║  ⚡ Functions: ${Object.keys(this.config.functions).length.toString().padEnd(44)} ║
║  ✅ Status: Ready                                              ║
╚════════════════════════════════════════════════════════════════╝
        `);
        });
    }
}