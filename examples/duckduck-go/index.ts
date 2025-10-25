import { LLMFramework, FrameworkConfig } from '../../index.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define a type for the configuration
interface CorticalAIConfig extends FrameworkConfig {
    systemPrompt: string;
    functions: Record<string, any>; // Consider defining more specific types for functions
    security: {
        allowCommands: boolean;
        allowScripts: boolean;
    };
}

// Application Configuration
const CONFIG: Partial<FrameworkConfig> = {
    systemPrompt: `You are CorticalAI, an advanced AI assistant with multiple capabilities:
  
  CORE ABILITIES:
  - Search information: Use "FUNCTION:searchDuck:query" for web searches
  - System commands: Use "FUNCTION:pingHost:hostname" for network testing
  - Browser actions: Use "FUNCTION:showAlert:message" for alerts
  - Data processing: Use "FUNCTION:calculateStats:numbers" for calculations
  
  FUNCTION CALLING RULES:
  - Use EXACTLY this format: FUNCTION:functionName:arguments
  - For normal conversation: respond without function calls
  - Never mix conversation and function calls in same response
  
  Be helpful, contextually aware, and use your functions when appropriate.`,

    functions: {
        // DuckDuckGo search function
        searchDuck: {
            type: 'api',
            endpoint: (query: string): string => {
                const url = new URL("https://api.duckduckgo.com/");
                url.searchParams.set('q', query);
                url.searchParams.set('format', 'json');
                url.searchParams.set('no_html', '1');
                url.searchParams.set('skip_disambig', '1');
                return url.toString();
            },
            method: 'GET',
            parseArgs: (raw: string): string => raw.trim(),
            transform: (data: any, query: string): any => {
                const results: any[] = [];

                if (data.AbstractText) {
                    results.push({
                        title: data.Heading || 'Abstract',
                        content: data.AbstractText,
                        source: data.AbstractSource || 'DuckDuckGo',
                        url: data.AbstractURL
                    });
                }

                if (data.Answer) {
                    results.push({
                        title: 'Direct Answer',
                        content: data.Answer,
                        source: 'DuckDuckGo Instant Answer'
                    });
                }

                if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                    data.RelatedTopics.slice(0, 3).forEach((topic: any) => {
                        if (topic.Text) {
                            results.push({
                                title: 'Related',
                                content: topic.Text,
                                url: topic.FirstURL
                            });
                        }
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
                        title: `Search Results for "${query}"`,
                        content: `No instant results found. You can search manually at: https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
                    }],
                    totalResults: 1,
                    searchTerm: query
                };
            },
            description: 'Search DuckDuckGo for information and instant answers'
        },

        // Network ping function
        pingHost: {
            type: 'command',
            command: (host: string): string => {
                // Basic hostname validation
                const cleanHost = host.replace(/[^a-zA-Z0-9.-]/g, '');
                return `ping -c 3 ${cleanHost}`;
            },
            parseArgs: (raw: string): string => raw.trim(),
            allowedCommands: ['ping'],
            timeout: 10000,
            description: 'Test network connectivity to a host'
        },

        // Statistics calculation
        calculateStats: {
            type: 'script',
            handler: async function (numbersString: string): Promise<any> {
                try {
                    const numbers = numbersString.split(/[,\s]+/).map(n => {
                        const num = parseFloat(n.trim());
                        if (isNaN(num)) throw new Error(`Invalid number: ${n}`);
                        return num;
                    });

                    if (numbers.length === 0) throw new Error('No valid numbers provided');

                    const sum = numbers.reduce((a, b) => a + b, 0);
                    const avg = sum / numbers.length;
                    const sorted = [...numbers].sort((a, b) => a - b);
                    const median = sorted.length % 2 === 0
                        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                        : sorted[Math.floor(sorted.length / 2)];

                    return {
                        numbers: numbers,
                        count: numbers.length,
                        sum: sum,
                        average: Math.round(avg * 100) / 100,
                        median: median,
                        min: Math.min(...numbers),
                        max: Math.max(...numbers),
                        range: Math.max(...numbers) - Math.min(...numbers)
                    };
                } catch (error: any) {
                    throw new Error(`Calculation error: ${error.message}`);
                }
            },
            parseArgs: (raw: string): string => raw.trim(),
            description: 'Calculate statistics for a list of numbers (comma or space separated)'
        }
    },

    security: {
        allowCommands: process.env.ALLOW_COMMANDS === 'true',
        allowScripts: process.env.ALLOW_SCRIPTS === 'true'
    },
    llm: {
        endpoint: process.env.LLM_ENDPOINT || "http://localhost:11434/api/generate",
        model: process.env.LLM_MODEL || "qwen3:0.6b",
        timeout: parseInt(process.env.LLM_TIMEOUT || "900000"),
        streamTimeout: parseInt(process.env.LLM_STREAM_TIMEOUT || "1200000")
    }
};

// Create and start the framework
async function main() {
    console.log('🚀 Starting CorticalAI v2.0...');
    try {
        const framework = new LLMFramework(CONFIG);
        await framework.start();
    } catch (error) {
        console.error('❌ Failed to start CorticalAI:', error);
        process.exit(1);
    }
}

main();
