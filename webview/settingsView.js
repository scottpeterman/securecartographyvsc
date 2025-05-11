// webview/settingsView.js
(function() {
    // Initialize communication with VS Code
    const vscode = acquireVsCodeApi();
    
    // Store settings state
    let settings = {};
    
    // DOM elements
    const saveSettingsButton = document.getElementById('saveSettings');
    const closeSettingsButton = document.getElementById('closeSettings');
    const exportSettingsButton = document.getElementById('exportSettings');
    const importSettingsButton = document.getElementById('importSettings');
    const refreshPathInfoButton = document.getElementById('refreshPathInfo');
    const pathInfoDisplay = document.getElementById('pathInfo');
    
    // Tab elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Handle tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const tabId = button.id.replace('tab-', 'content-');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // Directory browse buttons
    document.querySelectorAll('button[id^="browse-"]').forEach(button => {
        const key = button.id.replace('browse-', '');
        button.addEventListener('click', () => {
            vscode.postMessage({
                command: 'browseDirectory',
                key: key
            });
        });
    });
    
    // Save settings button
    saveSettingsButton.addEventListener('click', () => {
        // Collect form values
        settings.logLevel = document.getElementById('logLevel').value;
        settings.autoScrollLogs = document.getElementById('autoScrollLogs').checked;
        settings.maxHops = parseInt(document.getElementById('maxHops').value);
        settings.maxThreads = parseInt(document.getElementById('maxThreads').value);
        settings.scanTimeout = parseInt(document.getElementById('scanTimeout').value);
        
        // Send to extension
        vscode.postMessage({
            command: 'saveSettings',
            settings: settings
        });
    });
    
    // Close button
    closeSettingsButton.addEventListener('click', () => {
        // Ask extension to close the panel
        vscode.postMessage({
            command: 'closePanel'
        });
    });
    
    // Export button
    exportSettingsButton.addEventListener('click', () => {
        vscode.postMessage({
            command: 'exportSettings'
        });
    });
    
    // Import button
    importSettingsButton.addEventListener('click', () => {
        vscode.postMessage({
            command: 'importSettings'
        });
    });
    
    // Refresh path info button
    refreshPathInfoButton.addEventListener('click', () => {
        vscode.postMessage({
            command: 'getPathInfo'
        });
    });
    
    // Fill form with settings
    function updateFormWithSettings(settings) {
        // General tab
        document.getElementById('logLevel').value = settings.logLevel || 'info';
        document.getElementById('autoScrollLogs').checked = settings.autoScrollLogs !== false;
        
        // Paths tab
        document.getElementById('outputDirectory').value = settings.outputDirectory || '';
        document.getElementById('userTemplatesDirectory').value = settings.userTemplatesDirectory || '';
        document.getElementById('templatePath').value = settings.templatePath || '';
        
        // Discovery tab
        document.getElementById('maxHops').value = settings.maxHops || 4;
        document.getElementById('maxThreads').value = settings.maxThreads || 1;
        document.getElementById('scanTimeout').value = settings.scanTimeout || 60000;
    }
    
    // Update path info display
    function updatePathInfo(pathInfo) {
        pathInfoDisplay.textContent = JSON.stringify(pathInfo, null, 2);
    }
    
    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'loadSettings':
                settings = message.settings;
                updateFormWithSettings(settings);
                break;
                
            case 'pathInfo':
                updatePathInfo(message.pathInfo);
                break;
        }
    });
    
    // Request initial settings and path info
    vscode.postMessage({
        command: 'getPathInfo'
    });
})();