// Acquire VS Code API
const vscode = acquireVsCodeApi();

// Form elements
const seedDevicesInput = document.getElementById('seedDevices');
const credentialList = document.getElementById('credentialList');
const credUsernameInput = document.getElementById('credUsername');
const credPasswordInput = document.getElementById('credPassword');
const addCredButton = document.getElementById('addCredButton');

let credentials = [];
const maxHopsInput = document.getElementById('maxHops');
const exclusionsInput = document.getElementById('exclusions');
const outputFileInput = document.getElementById('outputFile');
const startButton = document.getElementById('startButton');
const viewTopologyButton = document.getElementById('viewTopologyButton');
const clearLogButton = document.getElementById('clearLogButton');
const openSettingsButton = document.getElementById('openSettingsButton');
const resultsDiv = document.getElementById('results');
const resultsContent = document.getElementById('resultsContent');
const logView = document.getElementById('logView');
const logLevelSelect = document.getElementById('logLevel');
const autoScrollCheckbox = document.getElementById('autoScroll');

// State management
let state = {
    isDiscovering: false,
    lastResults: null,
    logs: [],
    logLevel: 'info' // Default log level
};

// Log levels and their priorities
const LOG_LEVELS = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3
};

// Try to restore state
const previousState = vscode.getState();
if (previousState) {
    state = { ...state, ...previousState };
    
    // If we have previous results, display them
    if (state.lastResults) {
        showResults(state.lastResults);
    }
    
    // Restore logs
    if (state.logs && Array.isArray(state.logs)) {
        state.logs.forEach(logEntry => {
            appendLogEntry(logEntry, false);
        });
    }
    
    // Restore log level
    if (state.logLevel) {
        logLevelSelect.value = state.logLevel;
    }
}

// Initialize form from state if available
// Initialize form from state if available
function initializeForm() {
    if (state.formData) {
        seedDevicesInput.value = state.formData.seedDevices || '';
        maxHopsInput.value = state.formData.maxHops || '4';
        exclusionsInput.value = state.formData.exclusions || '';
        outputFileInput.value = state.formData.outputFile || 'network_topology.json';
        
        // Initialize credentials
        if (state.credentials && Array.isArray(state.credentials)) {
            credentials = state.credentials;
            renderCredentialList();
        } else if (state.formData.credentials) {
            initializeCredentialsFromString(state.formData.credentials);
        }
    }
}


// Save form state
function saveFormState() {
    const formData = {
        seedDevices: seedDevicesInput.value,
        credentials: getCredentialsString(), // Convert to string format for backward compatibility
        maxHops: maxHopsInput.value,
        exclusions: exclusionsInput.value,
        outputFile: outputFileInput.value
    };
    
    state.formData = formData;
    state.credentials = credentials; // Store actual credentials array
    vscode.setState(state);
    
    return formData;
}

// Show results
function showResults(results) {
    resultsDiv.classList.remove('hidden');
    
    if (results.error) {
        resultsContent.innerHTML = `<p class="error">Error: ${results.error}</p>`;
    } else {
        resultsContent.innerHTML = `
            <p>Total devices discovered: <strong>${results.totalDevices}</strong></p>
            <p>Successfully scanned: <strong class="success">${results.successful}</strong></p>
            <p>Failed to scan: <strong class="error">${results.failed}</strong></p>
            <p>Results saved to: <strong class="info">${results.outputFile}</strong></p>
            <p>Topology graph data saved to: <strong class="info">${results.graphFile}</strong></p>
        `;
    }
    
    state.lastResults = results;
    vscode.setState(state);
}

// Create progress container
function createProgressContainer() {
    // Remove existing container if present
    const existingContainer = document.getElementById('progressContainer');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    const container = document.createElement('div');
    container.id = 'progressContainer';
    container.className = 'progress-container';
    
    const title = document.createElement('div');
    title.className = 'progress-title';
    title.textContent = 'Discovery Progress';
    container.appendChild(title);
    
    const messageContainer = document.createElement('div');
    messageContainer.id = 'progressMessage';
    messageContainer.className = 'progress-message';
    messageContainer.textContent = 'Initializing discovery...';
    container.appendChild(messageContainer);
    
    resultsDiv.classList.remove('hidden');
    resultsContent.innerHTML = '';
    resultsContent.appendChild(container);
    
    return messageContainer;
}

// Update progress message
function updateProgress(message) {
    const messageContainer = document.getElementById('progressMessage');
    if (messageContainer) {
        // Append new message with timestamp
        const now = new Date();
        const timestamp = now.toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}\n`;
        messageContainer.textContent += formattedMessage;
        
        // Auto-scroll to bottom
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    
    // Also log the message
    logMessage('info', message);
}

// Log message function
function logMessage(level, message, save = true) {
    const selectedLevel = logLevelSelect.value;
    
    // Only display logs at or above the selected level
    if (LOG_LEVELS[level] >= LOG_LEVELS[selectedLevel]) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message
        };
        
        appendLogEntry(logEntry, autoScrollCheckbox.checked);
        
        // Save to state if requested
        if (save) {
            state.logs.push(logEntry);
            // Keep a max of 1000 log entries
            if (state.logs.length > 1000) {
                state.logs = state.logs.slice(-1000);
            }
            vscode.setState(state);
        }
    }
}

// Append log entry to the log view
function appendLogEntry(logEntry, autoScroll = true) {
    const { timestamp, level, message } = logEntry;
    
    // Create log entry element
    const entry = document.createElement('div');
    entry.className = `log-entry log-level-${level}`;
    
    // Format timestamp for display
    const time = new Date(timestamp).toLocaleTimeString();
    
    // Create entry content
    entry.innerHTML = `<span class="log-timestamp">[${time}]</span><span class="log-level ${level}">[${level.toUpperCase()}]</span> <span class="log-message">${escapeHtml(message)}</span>`;
    
    // Add to log view
    logView.appendChild(entry);
    
    // Auto-scroll if enabled
    if (autoScroll) {
        logView.scrollTop = logView.scrollHeight;
    }
}

// Escape HTML in log messages for safety
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Clear log
function clearLog() {
    logView.innerHTML = '';
    state.logs = [];
    vscode.setState(state);
    logMessage('info', 'Log cleared', true);
}

// Validate form inputs
function validateForm(formData) {
    if (!formData.seedDevices) {
        return 'Please enter at least one seed device.';
    }
    
    if (!formData.credentials) {
        return 'Please enter at least one set of credentials.';
    }
    
    if (!formData.outputFile) {
        return 'Please specify an output file path.';
    }
    
    return null; // No validation errors
}

// Start discovery process
function startDiscovery() {
    clearLog();
    console.log('startDiscovery function called');
    logMessage('debug', 'Start Discovery button clicked');
    // Save and validate form data
    const formData = saveFormState();
    const validationError = validateForm(formData);
    
    if (validationError) {
        logMessage('error', `Validation error: ${validationError}`);
        vscode.postMessage({
            command: 'showError',
            message: validationError
        });
        return;
    }
    
    // Disable form controls during discovery
    setFormEnabled(false);
    
    // Create or update progress display
    const progressElement = createProgressContainer();
    
    // Set state
    state.isDiscovering = true;
    vscode.setState(state);
    
    logMessage('info', 'Starting network discovery with the following configuration:');
    logMessage('info', `Seed Devices: ${formData.seedDevices}`);
    logMessage('info', `Credentials: ${formData.credentials.split('\n').length} credential sets`);
    logMessage('info', `Max Hops: ${formData.maxHops}`);
    logMessage('info', `Exclusions: ${formData.exclusions || 'None'}`);
    logMessage('info', `Output File: ${formData.outputFile}`);
    
    // Send message to extension to start discovery
    vscode.postMessage({
        command: 'startDiscovery',
        formData: formData
    });
}

// View existing topology
function viewTopology() {
    logMessage('info', 'Opening file dialog to select topology file...');
    vscode.postMessage({
        command: 'viewTopology'
    });
}

// Open settings panel
function openSettings() {
    logMessage('info', 'Opening settings panel...');
    vscode.postMessage({
        command: 'openSettings'
    });
}

// Set form enabled/disabled state
function setFormEnabled(enabled) {
    const controls = document.querySelectorAll('input, textarea, button');
    controls.forEach(control => {
        // Don't disable the log controls or settings button
        if (control !== logLevelSelect && 
            control !== autoScrollCheckbox && 
            control !== clearLogButton &&
            control !== openSettingsButton) {
            control.disabled = !enabled;
        }
    });
}

// Initialize form when page loads
initializeForm();

// Set form state based on current discovery status
if (state.isDiscovering) {
    setFormEnabled(false);
    createProgressContainer();
}

// Event listeners
startButton.addEventListener('click', startDiscovery);
viewTopologyButton.addEventListener('click', viewTopology);
clearLogButton.addEventListener('click', clearLog);
openSettingsButton.addEventListener('click', openSettings);

// Log level change handler
logLevelSelect.addEventListener('change', (e) => {
    state.logLevel = e.target.value;
    vscode.setState(state);
    
    // Re-render logs with new filter
    logView.innerHTML = '';
    state.logs.forEach(logEntry => {
        appendLogEntry(logEntry, false);
    });
    
    if (autoScrollCheckbox.checked) {
        logView.scrollTop = logView.scrollHeight;
    }
    
    logMessage('info', `Log level changed to: ${e.target.value}`);
});

// Listen for messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'discoveryProgress':
            updateProgress(message.message);
            break;
            
        case 'log':
            logMessage(message.level || 'info', message.message);
            break;
            
        case 'discoveryComplete':
            // Log completion
            logMessage('info', 'Discovery completed successfully');
            logMessage('info', `Total devices: ${message.results.totalDevices}`);
            logMessage('info', `Successfully scanned: ${message.results.successful}`);
            logMessage('info', `Failed to scan: ${message.results.failed}`);
            
            // Enable form controls
            setFormEnabled(true);
            state.isDiscovering = false;
            vscode.setState(state);
            
            // Display results
            showResults(message.results);
            break;
            
        case 'discoveryError':
            // Log error
            logMessage('error', `Discovery failed: ${message.error}`);
            
            // Enable form controls
            setFormEnabled(true);
            state.isDiscovering = false;
            vscode.setState(state);
            
            // Display error
            showResults({ error: message.error });
            break;
    }
});

// Add a new credential
function addCredential() {
    const username = credUsernameInput.value.trim();
    const password = credPasswordInput.value.trim();
    
    if (!username || !password) {
        logMessage('error', 'Username and password are required');
        return;
    }
    
    // Add to credentials array
    credentials.push({ username, password });
    
    // Clear inputs
    credUsernameInput.value = '';
    credPasswordInput.value = '';
    
    // Refresh the list
    renderCredentialList();
    
    // Save to state
    saveFormState();
    
    logMessage('info', `Added credential for user: ${username}`);
}

// Remove a credential
function removeCredential(index) {
    // Remove from array
    credentials.splice(index, 1);
    
    // Refresh the list
    renderCredentialList();
    
    // Save to state
    saveFormState();
    
    logMessage('info', 'Removed credential');
}

// Render the credential list
function renderCredentialList() {
    // Clear the list
    credentialList.innerHTML = '';
    
    if (credentials.length === 0) {
        credentialList.innerHTML = '<div class="empty-message">No credentials added yet</div>';
        return;
    }
    
    // Add each credential to the list
    credentials.forEach((cred, index) => {
        const item = document.createElement('div');
        item.className = 'credential-item';
        
        const info = document.createElement('div');
        info.className = 'credential-info';
        
        const username = document.createElement('span');
        username.className = 'credential-username';
        username.textContent = cred.username;
        
        const password = document.createElement('span');
        password.className = 'credential-password';
        password.textContent = '•'.repeat(8); // Mask the password
        
        const removeButton = document.createElement('button');
        removeButton.className = 'remove-cred-button';
        removeButton.textContent = 'Remove';
        removeButton.onclick = () => removeCredential(index);
        
        info.appendChild(username);
        info.appendChild(password);
        
        item.appendChild(info);
        item.appendChild(removeButton);
        
        credentialList.appendChild(item);
    });
}

// Convert credentials array to string format for backward compatibility
function getCredentialsString() {
    return credentials.map(cred => `${cred.username}:${cred.password}`).join('\n');
}

// Initialize credentials from string format (for backward compatibility)
function initializeCredentialsFromString(credString) {
    credentials = [];
    if (!credString) return;
    
    const lines = credString.split('\n').filter(line => line.trim() !== '');
    lines.forEach(line => {
        if (line.includes(':')) {
            const [username, password] = line.split(':');
            if (username && password) {
                credentials.push({
                    username: username.trim(),
                    password: password.trim()
                });
            }
        }
    });
    
    renderCredentialList();
}
// Add credential event listeners
addCredButton.addEventListener('click', addCredential);

// Also allow enter key to add credentials
credPasswordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addCredential();
    }
});
// Log initialization complete
logMessage('info', 'Network Mapper interface initialized and ready');