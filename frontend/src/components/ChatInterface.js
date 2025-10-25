import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, Paper, Typography, Grid, AppBar, Toolbar, Avatar, Chip, Fab, Slide, Zoom, Alert, CircularProgress, IconButton, Divider } from '@mui/material';
import { Send as SendIcon, SmartToy as BotIcon, Person as PersonIcon, Code as CodeIcon, Terminal as TerminalIcon, Api as ApiIcon, Refresh as RefreshIcon, MoreVert as MoreVertIcon } from '@mui/icons-material';
import { useApp } from '../context/AppContext';
import { useTheme } from '@mui/material/styles';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
export default function ChatInterface() {
    const { state, dispatch } = useApp();
    const [message, setMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const theme = useTheme();
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    useEffect(() => {
        scrollToBottom();
    }, [state.messages]);
    const getMessageIcon = (msg) => {
        if (msg.type === 'user')
            return <PersonIcon sx={{ fontSize: 18 }}/>;
        if (msg.type === 'function_result')
            return <CodeIcon sx={{ fontSize: 18 }}/>;
        return <BotIcon sx={{ fontSize: 18 }}/>;
    };
    const getMessageTitle = (msg) => {
        if (msg.type === 'user')
            return 'You';
        if (msg.type === 'function_result')
            return 'Function Result';
        if (msg.type === 'error')
            return 'Error';
        return state.config.name;
    };
    const formatFunctionResult = (content) => {
        if (typeof content === 'string') {
            try {
                const parsed = JSON.parse(content);
                return JSON.stringify(parsed, null, 2);
            }
            catch {
                return content;
            }
        }
        else if (typeof content === 'object') {
            return JSON.stringify(content, null, 2);
        }
        return String(content);
    };
    // Enhanced markdown components with sleeker styling
    const MarkdownComponents = {
        code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isDarkMode = theme.palette.mode === 'dark';
            return !inline && match ? (<SyntaxHighlighter style={isDarkMode ? oneDark : oneLight} language={match[1]} PreTag="div" customStyle={{
                    borderRadius: '12px',
                    margin: '16px 0',
                    fontSize: '0.875em',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    border: 'none'
                }} {...props}>
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>) : (<code className={className} style={{
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                    fontSize: '0.875em',
                    fontWeight: 500
                }} {...props}>
                    {children}
                </code>);
        },
        blockquote({ children }) {
            return (<Box component="blockquote" sx={{
                    borderLeft: `3px solid ${state.config.primaryColor}`,
                    paddingLeft: 3,
                    margin: '16px 0',
                    backgroundColor: 'rgba(0,0,0,0.03)',
                    borderRadius: '0 8px 8px 0',
                    fontStyle: 'italic',
                    py: 2
                }}>
                    {children}
                </Box>);
        },
        h1: ({ children }) => (<Typography variant="h4" gutterBottom sx={{ mt: 3, mb: 2, fontWeight: 700, letterSpacing: '-0.025em' }}>
                {children}
            </Typography>),
        h2: ({ children }) => (<Typography variant="h5" gutterBottom sx={{ mt: 2.5, mb: 1.5, fontWeight: 600, letterSpacing: '-0.015em' }}>
                {children}
            </Typography>),
        h3: ({ children }) => (<Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1.5, fontWeight: 600 }}>
                {children}
            </Typography>),
        p: ({ children }) => (<Typography variant="body1" paragraph sx={{ mb: 1.5, lineHeight: 1.7 }}>
                {children}
            </Typography>),
        a: ({ href, children }) => (<Typography component="a" href={href} target="_blank" rel="noopener noreferrer" sx={{
                color: state.config.primaryColor,
                textDecoration: 'none',
                fontWeight: 500,
                borderBottom: `1px solid transparent`,
                '&:hover': {
                    borderBottomColor: state.config.primaryColor,
                    opacity: 0.8
                }
            }}>
                {children}
            </Typography>),
    };
    const sendMessage = async () => {
        if (!message.trim() || state.isStreaming)
            return;
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: message,
            timestamp: new Date()
        };
        dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
        setMessage('');
        dispatch({ type: 'SET_STREAMING', payload: true });
        setIsTyping(true);
        try {
            const response = await fetch('/api/v1/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantContent = '';
            const assistantMessage = {
                id: Date.now() + 1,
                type: 'assistant',
                content: '',
                timestamp: new Date()
            };
            dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'token') {
                                assistantContent += data.text;
                                dispatch({
                                    type: 'UPDATE_LAST_MESSAGE',
                                    payload: { content: assistantContent }
                                });
                            }
                            else if (data.type === 'function_result') {
                                dispatch({
                                    type: 'ADD_MESSAGE',
                                    payload: {
                                        id: Date.now() + Math.random(),
                                        type: 'function_result',
                                        content: data.data,
                                        timestamp: new Date()
                                    }
                                });
                            }
                            else if (data.type === 'browser_action') {
                                if (data.action === 'alert') {
                                    dispatch({
                                        type: 'ADD_MESSAGE',
                                        payload: {
                                            id: Date.now() + Math.random(),
                                            type: 'browser_action',
                                            content: `Alert: ${data.data.message}`,
                                            timestamp: new Date()
                                        }
                                    });
                                }
                            }
                            else if (data.type === 'status') {
                                setIsTyping(true);
                            }
                            else if (data.type === 'error') {
                                dispatch({
                                    type: 'ADD_MESSAGE',
                                    payload: {
                                        id: Date.now() + Math.random(),
                                        type: 'error',
                                        content: data.error,
                                        timestamp: new Date()
                                    }
                                });
                            }
                        }
                        catch (e) {
                            console.error('Parse error:', e);
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('Chat error:', error);
            dispatch({
                type: 'ADD_MESSAGE',
                payload: {
                    id: Date.now() + Math.random(),
                    type: 'error',
                    content: `Failed to send message: ${error.message}`,
                    timestamp: new Date()
                }
            });
        }
        finally {
            dispatch({ type: 'SET_STREAMING', payload: false });
            setIsTyping(false);
        }
    };
    const handleExampleClick = (example) => {
        setMessage(example);
    };
    const getMessageColor = (msg) => {
        switch (msg.type) {
            case 'user':
                return state.config.primaryColor;
            case 'function_result':
                return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            case 'browser_action':
                return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
            case 'error':
                return 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)';
            default:
                return 'rgba(255,255,255,0.95)';
        }
    };
    const getTextColor = (msg) => {
        return msg.type === 'assistant' ? theme.palette.text.primary : 'white';
    };
    const renderMessageContent = (msg) => {
        if (msg.type === 'function_result') {
            return (<Typography variant="body2" sx={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace',
                    fontSize: '0.8rem',
                    lineHeight: 1.5
                }}>
                    {formatFunctionResult(msg.content)}
                </Typography>);
        }
        else if (msg.type === 'assistant') {
            return (<ReactMarkdown components={MarkdownComponents} remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml={false}>
                    {msg.content}
                </ReactMarkdown>);
        }
        else {
            return (<Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {msg.content}
                </Typography>);
        }
    };
    return (<Box sx={{
            height: '100vh',
            background: state.config.backgroundImage
                ? `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1)), url(${state.config.backgroundImage})`
                : `linear-gradient(135deg, ${state.config.primaryColor}08, ${state.config.secondaryColor}08)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(20px)'
        }}>
            {/* Sleeker Header */}
            <AppBar position="static" elevation={0} sx={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            color: theme.palette.text.primary
        }}>
                <Toolbar sx={{ minHeight: '64px !important', px: 3 }}>
                    {state.config.logo && (<Box component="img" src={state.config.logo} sx={{
                mr: 2,
                height: 32,
                width: 'auto',
                maxWidth: 120,
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.1))'
            }} alt="Logo"/>)}
                    <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                            {state.config.name}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.75rem' }}>
                            Functions: {Object.keys(state.functions || {}).length}
                        </Typography>
                    </Box>
                    {state.isStreaming ? (<CircularProgress size={20} sx={{ color: state.config.primaryColor }}/>) : (<IconButton size="small" sx={{ opacity: 0.7 }}>
                            <MoreVertIcon fontSize="small"/>
                        </IconButton>)}
                </Toolbar>
            </AppBar>

            {/* Enhanced Messages Area */}
            <Box sx={{
            flex: 1,
            overflow: 'auto',
            px: 2,
            py: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            '&::-webkit-scrollbar': {
                width: '6px',
            },
            '&::-webkit-scrollbar-track': {
                background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '3px',
            },
        }}>
                {state.messages.length === 0 && (<Box sx={{ textAlign: 'center', mt: 8, mb: 4 }}>
                        <Typography variant="h3" gutterBottom sx={{
                color: '#333333',
                fontWeight: 700,
                textShadow: '0 2px 20px rgba(255,255,255,0.8)',
                letterSpacing: '-0.02em'
            }}>
                            Welcome to {state.config.name}
                        </Typography>
                        <Typography variant="h6" sx={{
                color: '#666666',
                fontWeight: 400,
                textShadow: '0 1px 10px rgba(255,255,255,0.5)'
            }}>
                            {state.config.description}
                        </Typography>
                    </Box>)}

                {state.messages.map((msg, index) => (<Slide key={msg.id} direction={msg.type === 'user' ? 'left' : 'right'} in={true} timeout={300}>
                        <Box sx={{
                display: 'flex',
                justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                mb: 1
            }}>
                            <Paper elevation={0} sx={{
                p: 3,
                maxWidth: msg.type === 'function_result' ? '85%' : '75%',
                background: getMessageColor(msg),
                color: getTextColor(msg),
                backdropFilter: 'blur(20px)',
                borderRadius: msg.type === 'user'
                    ? '24px 24px 8px 24px'
                    : '24px 24px 24px 8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                position: 'relative',
                '&::before': msg.type !== 'assistant' ? {} : {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: '24px 24px 24px 8px',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.95))',
                    zIndex: -1
                }
            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                    <Box sx={{
                p: 0.5,
                borderRadius: '50%',
                background: msg.type === 'user'
                    ? 'rgba(255,255,255,0.2)'
                    : `${state.config.primaryColor}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                                        {getMessageIcon(msg)}
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                            {getMessageTitle(msg)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
                                            {msg.timestamp?.toLocaleTimeString()}
                                        </Typography>
                                    </Box>
                                </Box>
                                {renderMessageContent(msg)}
                            </Paper>
                        </Box>
                    </Slide>))}

                {isTyping && (<Zoom in={true}>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <Paper elevation={0} sx={{
                p: 3,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px 24px 24px 8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                border: '1px solid rgba(255,255,255,0.2)'
            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <CircularProgress size={16} sx={{ color: state.config.primaryColor }}/>
                                    <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                        {state.config.name} is thinking...
                                    </Typography>
                                </Box>
                            </Paper>
                        </Box>
                    </Zoom>)}

                <div ref={messagesEndRef}/>
            </Box>

            {/* Sleeker Input Area */}
            <Box sx={{ p: 3, pb: 4 }}>
                <Paper elevation={0} sx={{
            p: 2,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            border: '1px solid rgba(255,255,255,0.2)'
        }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                        <TextField fullWidth variant="standard" placeholder="Type your message..." value={message} onChange={(e) => setMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()} disabled={state.isStreaming} multiline maxRows={4} InputProps={{
            disableUnderline: true,
            sx: {
                fontSize: '1rem',
                lineHeight: 1.5,
                px: 2,
                py: 1
            }
        }}/>
                        <Fab size="medium" onClick={sendMessage} disabled={!message.trim() || state.isStreaming} sx={{
            background: state.config.primaryColor,
            color: 'white',
            '&:hover': {
                background: state.config.primaryColor,
                filter: 'brightness(110%)'
            },
            '&:disabled': {
                background: 'rgba(0,0,0,0.1)',
                color: 'rgba(0,0,0,0.3)'
            },
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            width: 48,
            height: 48
        }}>
                            <SendIcon sx={{ fontSize: 20 }}/>
                        </Fab>
                    </Box>

                    {/* Enhanced Examples */}
                    {state.examples.length > 0 && state.messages.length === 0 && (<Box sx={{ mt: 3, pt: 2 }}>
                            <Divider sx={{ mb: 2, opacity: 0.3 }}/>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                                Try asking:
                            </Typography>
                            <Grid container spacing={1.5}>
                                {state.examples.slice(0, 4).map((example, index) => (<Grid item key={index}>
                                        <Chip label={example} onClick={() => handleExampleClick(example)} sx={{
                    cursor: 'pointer',
                    background: 'rgba(0,0,0,0.05)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    fontWeight: 500,
                    '&:hover': {
                        background: `${state.config.primaryColor}15`,
                        borderColor: `${state.config.primaryColor}30`,
                        transform: 'translateY(-1px)'
                    },
                    transition: 'all 0.2s ease'
                }}/>
                                    </Grid>))}
                            </Grid>
                        </Box>)}
                </Paper>
            </Box>
        </Box>);
}
