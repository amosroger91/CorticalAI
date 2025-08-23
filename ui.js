export function generateUI(config) {
    // Ensure colors have # prefix and are valid hex colors
    const primaryColor = config.app.primaryColor?.startsWith('#') ? config.app.primaryColor : `#${config.app.primaryColor || '1DB954'}`;
    const secondaryColor = config.app.secondaryColor?.startsWith('#') ? config.app.secondaryColor : `#${config.app.secondaryColor || '191414'}`;

    console.log('UI Colors - Primary:', primaryColor, 'Secondary:', secondaryColor); // Debug log

    return `<!DOCTYPE html>
<html>
<head>
    <title>${config.app.name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
          background: linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15);
          min-height: 100vh;
        }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header h1 { 
          color: ${primaryColor}; 
          margin-bottom: 10px; 
          font-size: 2.5em;
          font-weight: 300;
        }
        .header p { 
          color: ${secondaryColor}; 
          font-size: 1.2em;
        }
        .chat-container { 
          background: white; 
          border-radius: 15px; 
          height: 500px; 
          overflow-y: auto; 
          padding: 20px; 
          margin-bottom: 20px; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .message { 
          margin: 15px 0; 
          padding: 15px; 
          border-radius: 12px; 
          animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .user { 
          background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd);
          color: white; 
          margin-left: 20%; 
          border-radius: 12px 12px 4px 12px;
        }
        .assistant { 
          background: #f8f9fa; 
          margin-right: 20%; 
          border: 1px solid #e9ecef;
          border-radius: 12px 12px 12px 4px;
        }
        .function-results { 
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe); 
          padding: 20px; 
          border-radius: 12px; 
          margin: 15px 0;
          border-left: 4px solid ${primaryColor};
        }
        .result-item { 
          background: white; 
          padding: 15px; 
          margin: 10px 0; 
          border-radius: 8px; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          border-left: 3px solid ${primaryColor}; 
        }
        .input-container { 
          display: flex; 
          gap: 15px; 
          background: white;
          padding: 20px;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .input-container input { 
          flex: 1; 
          padding: 15px 20px; 
          border: 2px solid #e9ecef; 
          border-radius: 25px; 
          font-size: 16px;
          transition: border-color 0.3s ease;
        }
        .input-container input:focus {
          outline: none;
          border-color: ${primaryColor};
        }
        .input-container button { 
          padding: 15px 30px; 
          background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd);
          color: white; 
          border: none; 
          border-radius: 25px; 
          cursor: pointer; 
          font-weight: 600;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .input-container button:hover:not(:disabled) { 
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .input-container button:disabled { 
          background: #ccc; 
          cursor: not-allowed; 
          transform: none;
          box-shadow: none;
        }
        .status { 
          text-align: center; 
          padding: 10px; 
          color: ${primaryColor}; 
          font-style: italic; 
        }
        .error-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(135deg, #dc3545, #c82333);
          color: white;
          padding: 15px 20px;
          text-align: center;
          font-weight: 600;
          box-shadow: 0 4px 20px rgba(220, 53, 69, 0.3);
          z-index: 1000;
          transform: translateY(-100%);
          transition: transform 0.3s ease;
        }
        .error-banner.show {
          transform: translateY(0);
        }
        .error-banner .close-btn {
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          font-weight: bold;
        }
        .error-banner.show ~ .container {
          margin-top: 80px;
        }
        .json-collapsible {
          background: white;
          border: 1px solid #ddd;
          border-radius: 5px;
          margin: 10px 0;
        }
        .json-header {
          background: #f8f9fa;
          padding: 10px 15px;
          cursor: pointer;
          font-weight: 600;
          border-bottom: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .json-header:hover {
          background: #e9ecef;
        }
        .json-content {
          padding: 10px 15px;
          max-height: 300px;
          overflow: auto;
        }
        .json-content pre {
          margin: 0;
          font-size: 12px;
          line-height: 1.4;
        }
        .json-collapsed .json-content {
          display: none;
        }
        .expand-icon {
          font-size: 14px;
          transition: transform 0.2s ease;
        }
        .json-collapsed .expand-icon {
          transform: rotate(-90deg);
        }
    </style>
</head>
<body>
    <div class="error-banner" id="errorBanner">
        <span id="errorMessage"></span>
        <button class="close-btn" onclick="hideError()">&times;</button>
    </div>
    <div class="container">
        <div class="header">
            <h1>${config.app.name}</h1>
            <p>${config.app.description}</p>
        </div>
        <div class="chat-container" id="chat">
            <div class="message assistant">${config.app.welcomeMessage}</div>
        </div>
        <div class="input-container">
            <input type="text" id="messageInput" placeholder="Type your message..." />
            <button id="sendButton" onclick="sendMessage()">Send</button>
        </div>
    </div>

    <script>
        const chat = document.getElementById('chat');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        
        function addMessage(text, type) {
            const div = document.createElement('div');
            div.className = 'message ' + type;
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
        
        function addStatus(text) {
            const div = document.createElement('div');
            div.className = 'status';
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
        
        function addFunctionResults(data, type = 'search_results') {
            const div = document.createElement('div');
            div.className = 'function-results';
            
            if (type === 'search_results' && data.results) {
                div.innerHTML = '<strong>Results:</strong>';
                
                data.results.forEach(result => {
                    const item = document.createElement('div');
                    item.className = 'result-item';
                    
                    // Generic result rendering - works for any data structure
                    let content = '';
                    for (const [key, value] of Object.entries(result)) {
                        if (value && key !== 'id') {
                            const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                            if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('www'))) {
                                content += \`<div><strong>\${displayKey}:</strong> <a href="\${value}" target="_blank" style="color: ${primaryColor}; text-decoration: none;">\${value.length > 50 ? value.substring(0, 50) + '...' : value}</a></div>\`;
                            } else {
                                content += \`<div><strong>\${displayKey}:</strong> \${value}</div>\`;
                            }
                        }
                    }
                    
                    item.innerHTML = content || '<div>No details available</div>';
                    div.appendChild(item);
                });
            } else {
                // Generic data display
                const item = document.createElement('div');
                item.className = 'result-item';
                
                let content = '';
                for (const [key, value] of Object.entries(data)) {
                    if (value) {
                        const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                        content += \`<div><strong>\${displayKey}:</strong> \${JSON.stringify(value)}</div>\`;
                    }
                }
                
                item.innerHTML = content || '<div>No data available</div>';
                div.appendChild(item);
            }
            
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
        
        function addRawData(data, title = 'Function Result') {
            const div = document.createElement('div');
            div.className = 'function-results';
            
            const jsonDiv = document.createElement('div');
            jsonDiv.className = 'json-collapsible json-collapsed';
            
            const header = document.createElement('div');
            header.className = 'json-header';
            header.innerHTML = \`
                <span>\${title}</span>
                <span class="expand-icon">▼</span>
            \`;
            header.onclick = () => {
                jsonDiv.classList.toggle('json-collapsed');
            };
            
            const content = document.createElement('div');
            content.className = 'json-content';
            content.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            
            jsonDiv.appendChild(header);
            jsonDiv.appendChild(content);
            div.appendChild(jsonDiv);
            
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
        
        function showError(message) {
            const errorBanner = document.getElementById('errorBanner');
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = message;
            errorBanner.classList.add('show');
            
            // Auto-hide after 10 seconds
            setTimeout(() => {
                hideError();
            }, 10000);
        }
        
        function hideError() {
            const errorBanner = document.getElementById('errorBanner');
            errorBanner.classList.remove('show');
        }
        
        async function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || sendButton.disabled) return;
            
            addMessage(message, 'user');
            messageInput.value = '';
            sendButton.disabled = true;
            
            try {
                const response = await fetch('/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let assistantMessage = '';
                let messageDiv = null;
                
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                
                                if (data.type === 'status') {
                                    addStatus(data.text);
                                } else if (data.type === 'error') {
                                    showError(data.error);
                                    addMessage('I encountered an error: ' + data.error, 'assistant');
                                } else if (data.type === 'token') {
                                    if (!messageDiv) {
                                        messageDiv = document.createElement('div');
                                        messageDiv.className = 'message assistant';
                                        chat.appendChild(messageDiv);
                                    }
                                    assistantMessage += data.text;
                                    messageDiv.textContent = assistantMessage;
                                    chat.scrollTop = chat.scrollHeight;
                                } else if (data.type === 'search_results') {
                                    addFunctionResults(data, 'search_results');
                                } else if (data.type === 'function_result') {
                                    addRawData(data.data, 'Function Result');
                                }
                            } catch (e) {
                                console.error('Parse error:', e);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Network request failed:', error);
                showError('Network error: ' + error.message);
                addMessage('I apologize, but I encountered a network error. Please check your connection and try again.', 'assistant');
            } finally {
                sendButton.disabled = false;
                messageInput.focus();
            }
        }
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        
        // Focus input on load
        messageInput.focus();
    </script>
</body>
</html>`;
}