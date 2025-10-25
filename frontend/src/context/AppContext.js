import React, { createContext, useContext, useReducer } from 'react';
const AppContext = createContext();
// Default fallback config - will be overridden by backend config
const initialState = {
    config: {
        name: 'CorticalAI',
        description: 'AI-powered assistant',
        primaryColor: '#DE5833',
        secondaryColor: '#333333',
        backgroundImage: 'https://pixabay.com/get/g5334fd93f81a4a15881fa33b8cff25c92c1e255762ebb9f730105fbcd96a63bc8834d27d2deb5f7875deb34cb394bae0.jpg',
        chatOpacity: 0.8,
        logo: null,
        navigationLinks: [],
        darkMode: false
    },
    messages: [],
    examples: [],
    isStreaming: false,
    user: null,
    auth: null
};
function appReducer(state, action) {
    switch (action.type) {
        case 'SET_CONFIG':
            return {
                ...state,
                config: {
                    ...state.config,
                    ...action.payload
                }
            };
        case 'ADD_MESSAGE':
            return { ...state, messages: [...state.messages, action.payload] };
        case 'UPDATE_LAST_MESSAGE':
            const updatedMessages = [...state.messages];
            if (updatedMessages.length > 0) {
                updatedMessages[updatedMessages.length - 1] = {
                    ...updatedMessages[updatedMessages.length - 1],
                    ...action.payload
                };
            }
            return { ...state, messages: updatedMessages };
        case 'SET_EXAMPLES':
            return { ...state, examples: action.payload };
        case 'SET_STREAMING':
            return { ...state, isStreaming: action.payload };
        case 'SET_AUTH':
            return { ...state, auth: action.payload };
        default:
            return state;
    }
}
export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(appReducer, initialState);
    return (<AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>);
}
export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
};
