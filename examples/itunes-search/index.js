import { LLMFramework, fetchAPI } from '../../index.js';
import dotenv from 'dotenv';

dotenv.config();

// Add this debug line:
console.log('ENV DEBUG:', {
    primary: process.env.APP_PRIMARYCOLOR,
    secondary: process.env.APP_SECONDARYCOLOR,
    name: process.env.APP_NAME
});

const CONFIG = {
    // System Prompt - Define how your LLM should behave
    systemPrompt: `You are a music assistant. You can chat normally AND search for music.

IMPORTANT RULES:
1. For search requests: respond with ONLY the function call, nothing else
2. For chat: respond normally without any function calls

SEARCH requests (respond with ONLY the function):
- "find metallica" → FUNCTION:searchMusic:metallica
- "search for jazz" → FUNCTION:searchMusic:jazz
- "look up Beatles" → FUNCTION:searchMusic:Beatles

CHAT requests (respond normally):
- "hello" → "Hello! How can I help you today?"
- "what can you do?" → "I can help you search for music or just chat!"

NEVER mix conversation and function calls in the same response.
Either respond with ONLY "FUNCTION:searchMusic:[term]" OR respond conversationally.`,

    // Available Functions - Add/remove functions here
    functions: {
        searchMusic: {
            // Function implementation - expects a string directly, not an object
            handler: async (searchTerm) => {
                console.log(`=== HANDLER CALLED ===`);
                console.log(`Searching iTunes for: ${searchTerm}`);

                // Parse search term for media type filtering
                let term = searchTerm;
                let media = 'all';

                if (searchTerm.includes('|')) {
                    [term, media] = searchTerm.split('|');
                }

                try {
                    const url = new URL("https://itunes.apple.com/search");
                    url.searchParams.set('term', term.trim());
                    url.searchParams.set('limit', '12');
                    url.searchParams.set('explicit', 'No');

                    if (media !== 'all') {
                        url.searchParams.set('media', media);
                    }

                    console.log('iTunes API URL:', url.toString());
                    const response = await fetchAPI(url.toString());

                    // Add detailed debugging
                    console.log('iTunes API response type:', typeof response);
                    console.log('Response.results exists:', !!response.results);
                    console.log('Response.results length:', response.results ? response.results.length : 'N/A');
                    console.log('Response.resultCount:', response.resultCount);

                    if (response.results && response.results.length > 0) {
                        console.log('SUCCESS: Found results');
                        return {
                            success: true,
                            results: response.results.map(item => ({
                                name: item.trackName || item.collectionName || item.artistName,
                                artist: item.artistName,
                                album: item.collectionName,
                                type: item.kind || item.wrapperType,
                                genre: item.primaryGenreName,
                                price: item.trackPrice || item.collectionPrice,
                                currency: item.currency,
                                releaseDate: item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
                                previewUrl: item.previewUrl,
                                artworkUrl: item.artworkUrl100,
                                iTunesUrl: item.trackViewUrl || item.collectionViewUrl || item.artistViewUrl
                            })),
                            totalResults: response.resultCount,
                            searchTerm: term,
                            mediaType: media
                        };
                    } else {
                        console.log('FAILURE: No results found or empty results array');
                        return {
                            success: false,
                            message: `No results found for "${term}" in ${media === 'all' ? 'any category' : media}. Try different keywords or check spelling.`
                        };
                    }
                } catch (error) {
                    console.error('iTunes API error:', error);
                    return {
                        success: false,
                        error: `Search failed: ${error.message}`
                    };
                }
            },

            // Validation rules - removed since we're passing string directly
            validation: {
                required: [],
                types: {}
            },

            // How to parse arguments from LLM response - returns string directly
            parseArgs: (rawArgs) => {
                console.log('parseArgs called with:', rawArgs);
                let searchTerm = rawArgs.trim();

                // Handle case where LLM uses placeholder text
                if (searchTerm === 'search_term' || searchTerm === '[actual_search_term]') {
                    console.warn('LLM used placeholder text, this indicates a prompt issue');
                    throw new Error('LLM used placeholder text instead of actual search term');
                }

                return searchTerm;
            }
        }
    }
};

// start the web server
const framework = new LLMFramework(CONFIG);
framework.start();