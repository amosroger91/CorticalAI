export function generateUI(config) {
  // Ensure colors have # prefix and are valid hex colors
  const primaryColor = config.app.primaryColor?.startsWith('#') ? config.app.primaryColor : `#${config.app.primaryColor || '1DB954'}`;
  const secondaryColor = config.app.secondaryColor?.startsWith('#') ? config.app.secondaryColor : `#${config.app.secondaryColor || '191414'}`;
  const darkMode = config.app.darkMode || false;

  // Handle background image/video - no overlay shader
  const backgroundStyle = config.app.backgroundImage
    ? `background-image: url('${config.app.backgroundImage}'); background-size: cover; background-position: center;`
    : darkMode
      ? `background: linear-gradient(135deg, #1a1a1a, #2d2d2d);`
      : `background: linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15);`;

  // Chat window transparency (0.0 to 1.0, default 0.95)
  const chatOpacity = config.app.chatOpacity || 0.95;

  // Color scheme based on dark/light mode
  const colors = darkMode ? {
    containerBg: `rgba(40,40,40,${chatOpacity})`,
    containerBorder: 'rgba(80,80,80,0.3)',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    messageBg: '#4a4a4a',
    messageBorder: 'rgba(80,80,80,0.3)',
    inputBg: 'rgba(60,60,60,0.9)',
    inputBorder: 'rgba(80,80,80,0.5)',
    resultsBg: 'linear-gradient(135deg, #2a2a3a, #3a3a4a)',
    resultItemBg: 'rgba(60,60,60,0.8)',
    exampleItemBg: 'rgba(50,50,50,0.8)',
    exampleItemHover: `${primaryColor}25`
  } : {
    containerBg: `rgba(255,255,255,${chatOpacity})`,
    containerBorder: 'rgba(200,200,200,0.3)',
    textPrimary: '#000000',
    textSecondary: secondaryColor,
    messageBg: '#f8f9fa',
    messageBorder: '#e9ecef',
    inputBg: 'rgba(255,255,255,0.9)',
    inputBorder: '#e9ecef',
    resultsBg: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
    resultItemBg: 'white',
    exampleItemBg: 'rgba(255,255,255,0.8)',
    exampleItemHover: `${primaryColor}15`
  };

  console.log('UI Colors - Primary:', primaryColor, 'Secondary:', secondaryColor, 'Dark Mode:', darkMode);

  return `<!DOCTYPE html>
<html>
<head>
    <title>${config.app.name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
          ${backgroundStyle}
          min-height: 100vh;
          position: relative;
          margin: 0;
          padding-top: ${config.app.logo || config.app.navigationLinks ? '80px' : '0'};
        }
        /* Video background support */
        body::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          ${config.app.backgroundImage && (config.app.backgroundImage.endsWith('.mp4') || config.app.backgroundImage.endsWith('.webm') || config.app.backgroundImage.endsWith('.mov'))
      ? `background: none;`
      : ''}
        }
        /* Video element for video backgrounds */
        ${config.app.backgroundImage && (config.app.backgroundImage.endsWith('.mp4') || config.app.backgroundImage.endsWith('.webm') || config.app.backgroundImage.endsWith('.mov'))
      ? `
        body::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          background: url('${config.app.backgroundImage}') center/cover no-repeat;
          /* For video, we'll use a different approach in the script */
        }` : ''}
        .navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 70px;
          background: ${colors.containerBg};
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 1000;
          border-bottom: 1px solid ${colors.containerBorder};
        }
        .navbar-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .navbar-logo {
          height: 40px;
          max-width: 200px;
          object-fit: contain;
        }
        .navbar-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .navbar-link {
          color: ${colors.textSecondary};
          text-decoration: none;
          font-weight: 500;
          padding: 8px 16px;
          border-radius: 20px;
          transition: all 0.2s ease;
        }
        .navbar-link:hover {
          background: ${colors.exampleItemHover};
          color: ${primaryColor};
        }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          background: ${colors.containerBg};
          backdrop-filter: blur(10px);
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          border: 1px solid ${colors.containerBorder};
        }
        .header h1 { 
          color: ${primaryColor}; 
          margin-bottom: 10px; 
          font-size: 2.5em;
          font-weight: 300;
        }
        .header p { 
          color: ${colors.textSecondary}; 
          font-size: 1.2em;
        }
        .chat-container { 
          background: ${colors.containerBg}; 
          backdrop-filter: blur(10px);
          border-radius: 15px; 
          height: 500px; 
          overflow-y: auto; 
          padding: 20px; 
          margin-bottom: 20px; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          border: 1px solid ${colors.containerBorder};
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
          background: ${colors.messageBg}; 
          margin-right: 20%; 
          border: 1px solid ${colors.messageBorder};
          border-radius: 12px 12px 12px 4px;
          color: ${colors.textPrimary};
        }
        .function-results { 
          background: ${colors.resultsBg}; 
          padding: 20px; 
          border-radius: 12px; 
          margin: 15px 0;
          border-left: 4px solid ${primaryColor};
          color: ${colors.textPrimary};
        }
        .result-item { 
          background: ${colors.resultItemBg}; 
          padding: 15px; 
          margin: 10px 0; 
          border-radius: 8px; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          border-left: 3px solid ${primaryColor};
          color: ${colors.textPrimary};
        }
        .input-container { 
          display: flex; 
          gap: 15px; 
          background: ${colors.containerBg};
          backdrop-filter: blur(10px);
          padding: 20px;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          margin-bottom: 20px;
          border: 1px solid ${colors.containerBorder};
        }
        .input-container input { 
          flex: 1; 
          padding: 15px 20px; 
          border: 2px solid ${colors.inputBorder}; 
          border-radius: 25px; 
          font-size: 16px;
          transition: border-color 0.3s ease;
          background: ${colors.inputBg};
          color: ${colors.textPrimary};
        }
        .input-container input:focus {
          outline: none;
          border-color: ${primaryColor};
        }
        .input-container input::placeholder {
          color: ${darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'};
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
        .example-prompts {
          background: ${colors.containerBg};
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 20px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          border: 1px solid ${colors.containerBorder};
        }
        .example-prompts h3 {
          color: ${colors.textSecondary};
          margin-bottom: 15px;
          font-size: 1.2em;
          font-weight: 600;
        }
        .example-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 15px;
        }
        .example-item {
          background: ${colors.exampleItemBg};
          border: 1px solid ${colors.containerBorder};
          border-radius: 8px;
          padding: 15px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
          color: ${colors.textSecondary};
        }
        .example-item:hover {
          background: ${colors.exampleItemHover};
          border-color: ${primaryColor};
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .loading-examples {
          text-align: center;
          color: ${colors.textSecondary};
          font-style: italic;
          padding: 20px;
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
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        }
        .modal-content {
          background: ${darkMode ? '#2a2a2a' : 'white'};
          border-radius: 15px;
          width: 90%;
          max-width: 800px;
          height: 80%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          border: 1px solid ${colors.containerBorder};
        }
        .modal-header {
          background: ${primaryColor};
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-close {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          font-weight: bold;
          padding: 5px 10px;
          border-radius: 5px;
          transition: background 0.2s ease;
        }
        .modal-close:hover {
          background: rgba(255,255,255,0.2);
        }
        .modal-iframe {
          flex: 1;
          border: none;
          width: 100%;
        }
    </style>
</head>
<body>
    <div class="error-banner" id="errorBanner">
        <span id="errorMessage"></span>
        <button class="close-btn" onclick="hideError()">&times;</button>
    </div>
    ${config.app.logo || config.app.navigationLinks ? `
    <nav class="navbar">
        <div class="navbar-left">
            ${config.app.logo ? `<img src="${config.app.logo}" alt="${config.app.name}" class="navbar-logo">` : ''}
        </div>
        <div class="navbar-right">
            ${config.app.navigationLinks ? config.app.navigationLinks.map(link =>
        `<a href="${link.url}" class="navbar-link" ${link.external !== false ? 'target="_blank" rel="noopener"' : ''}>${link.text}</a>`
      ).join('') : ''}
        </div>
    </nav>
    ` : ''}
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
        <div class="example-prompts">
            <h3>Common Support Requests</h3>
            <div id="exampleGrid" class="example-grid">
                <div class="loading-examples">Loading example prompts...</div>
            </div>
        </div>
    </div>

    <script>
        const chat = document.getElementById('chat');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const exampleGrid = document.getElementById('exampleGrid');
        
        // Handle video background if provided
        const backgroundImage = '${config.app.backgroundImage || ''}';
        if (backgroundImage && (backgroundImage.endsWith('.mp4') || backgroundImage.endsWith('.webm') || backgroundImage.endsWith('.mov'))) {
            const video = document.createElement('video');
            video.src = backgroundImage;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.style.position = 'fixed';
            video.style.top = '0';
            video.style.left = '0';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            video.style.zIndex = '-1';
            document.body.appendChild(video);
        }
        
        // Load example prompts on page load
        loadExamplePrompts();
        
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
            
            setTimeout(() => {
                hideError();
            }, 10000);
        }
        
        function hideError() {
            const errorBanner = document.getElementById('errorBanner');
            errorBanner.classList.remove('show');
        }
        
        function fillInput(text) {
            messageInput.value = text;
            messageInput.focus();
        }
        
        // Browser action handlers
        function executeBrowserAction(action, data) {
            switch (action) {
                case 'alert':
                    window.alert(data.message);
                    break;
                case 'openWindow':
                    window.open(data.url, '_blank', 'noopener,noreferrer');
                    break;
                case 'modal':
                    showModal(data.url);
                    break;
                case 'speak':
                    speakText(data.text);
                    break;
                default:
                    console.warn('Unknown browser action:', action);
            }
        }
        
        function showModal(url) {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            
            const modal = document.createElement('div');
            modal.className = 'modal-content';
            
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.innerHTML = \`
                <h3>Content Viewer</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            \`;
            
            const iframe = document.createElement('iframe');
            iframe.className = 'modal-iframe';
            iframe.src = url;
            iframe.sandbox = 'allow-same-origin allow-scripts allow-popups allow-forms';
            
            modal.appendChild(header);
            modal.appendChild(iframe);
            overlay.appendChild(modal);
            
            // Add click outside to close
            overlay.onclick = (e) => {
                if (e.target === overlay) closeModal();
            };
            
            document.body.appendChild(overlay);
            overlay.id = 'currentModal';
        }
        
        function closeModal() {
            const modal = document.getElementById('currentModal');
            if (modal) {
                document.body.removeChild(modal);
            }
        }
        
        function speakText(text) {
            if ('speechSynthesis' in window) {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.9;
                utterance.pitch = 1;
                utterance.volume = 0.8;
                
                // Try to use a natural voice
                const voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    // Prefer English voices
                    const englishVoice = voices.find(voice => 
                        voice.lang.startsWith('en') && voice.name.includes('Natural')
                    ) || voices.find(voice => voice.lang.startsWith('en'));
                    
                    if (englishVoice) {
                        utterance.voice = englishVoice;
                    }
                }
                
                window.speechSynthesis.speak(utterance);
            } else {
                console.warn('Speech synthesis not supported');
                showError('Text-to-speech is not supported in your browser');
            }
        }
        
        async function loadExamplePrompts() {
            try {
                const response = await fetch('/examples', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    displayExamples(data.examples);
                } else {
                    throw new Error('Failed to load examples');
                }
            } catch (error) {
                console.error('Failed to load example prompts:', error);
                exampleGrid.innerHTML = '<div class="loading-examples">Unable to load example prompts</div>';
            }
        }
        
        function displayExamples(examples) {
            exampleGrid.innerHTML = '';
            examples.forEach(example => {
                const item = document.createElement('div');
                item.className = 'example-item';
                item.textContent = example;
                item.onclick = () => fillInput(example);
                exampleGrid.appendChild(item);
            });
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
                                } else if (data.type === 'browser_action') {
                                    executeBrowserAction(data.action, data.data);
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
        
        messageInput.focus();
    </script>
</body>
</html>`;
}