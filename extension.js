/**
 * Network Mapper extension for Visual Studio Code
 */

// Import the necessary VS Code components
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

let SettingsManager = null;
let SettingsPanel = null;

try {
  console.log('Attempting to load SettingsManager from:', path.join(__dirname, 'settings.js'));
  
  if (fs.existsSync(path.join(__dirname, 'settings.js'))) {
    SettingsManager = require('./settings');
    console.log('SettingsManager loaded successfully');
  } else {
    console.error('settings.js file not found');
  }
} catch (err) {
  console.error('Error loading settings.js module:', err.message);
  console.error(err.stack);
}

try {
  console.log('Attempting to load SettingsPanel from:', path.join(__dirname, 'settingsPanel.js'));
  
  if (fs.existsSync(path.join(__dirname, 'settingsPanel.js'))) {
    SettingsPanel = require('./settingsPanel');
    console.log('SettingsPanel loaded successfully');
  } else {
    console.error('settingsPanel.js file not found');
  }
} catch (err) {
  console.error('Error loading settingsPanel.js module:', err.message);
  console.error(err.stack);
}

// Import the NetworkMapperPanel
const NetworkMapperPanel = require('./networkMapperPanel');

// First, define a function to extract required components from crawl4.js
function loadCrawl4Components() {
  // Try to load components directly
  try {
    const crawl4Path = path.join(__dirname, 'lib', 'crawl4.js');
    console.log('Looking for crawl4.js at:', crawl4Path);
    
    // Check if the file exists
    if (!fs.existsSync(crawl4Path)) {
      console.error(`crawl4.js not found at: ${crawl4Path}`);
      return null;
    }
    
    // Load the module
    const crawl4 = require(crawl4Path);
    
    // Extract the available classes and functions
    const components = {};
    
    // Helper function to find a class or function in the global scope
    const findInGlobal = (name) => {
      return typeof global[name] === 'function' || typeof global[name] === 'object' ? global[name] : null;
    };
    
    // Try to extract each component, with fallbacks
    components.NetworkDiscovery = crawl4.NetworkDiscovery || findInGlobal('NetworkDiscovery');
    components.Credential = crawl4.Credential || findInGlobal('Credential');
    components.ParseMethod = crawl4.ParseMethod || findInGlobal('ParseMethod');
    components.DiscoveredDevice = crawl4.DiscoveredDevice || findInGlobal('DiscoveredDevice');
    components.ExtensibleParser = crawl4.ExtensibleParser || findInGlobal('ExtensibleParser');
    
    // Log what we found
    console.log('Extracted components from crawl4.js:');
    for (const [name, component] of Object.entries(components)) {
      console.log(`- ${name}: ${component ? typeof component : 'not found'}`);
    }
    
    // Return the extracted components
    return components;
  } catch (error) {
    console.error('Error loading crawl4.js components:', error.message);
    console.error('Stack trace:', error.stack);
    return null;
  }
}

class NetworkMapperViewProvider {
  constructor(context) {
    this._context = context;
    this._view = undefined;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };
    
    webviewView.webview.html = this._getWebviewContent();
    
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'openNetworkMapper':
          vscode.commands.executeCommand('networkMapper.openInterface');
          break;
        case 'openSettings':
          vscode.commands.executeCommand('networkMapper.openSettings');
          break;
        case 'openTopologyViewer':
          vscode.commands.executeCommand('networkMapper.openTopologyViewer');
          break;
      }
    });
  }

  _getWebviewContent() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Network Mapper</title>
      <style>
        body {
          padding: 10px;
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
        }
        .action-button {
          display: block;
          width: 100%;
          padding: 8px 12px;
          margin: 8px 0;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          cursor: pointer;
          text-align: left;
          border-radius: 2px;
        }
        .action-button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        h3 {
          margin-bottom: 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
          padding-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <h3>Network Mapper</h3>
      <button class="action-button" id="openDiscovery">Network Discovery</button>
      <button class="action-button" id="openTopology">View Topology</button>
      <button class="action-button" id="openSettings">Settings</button>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('openDiscovery').addEventListener('click', () => {
          vscode.postMessage({ command: 'openNetworkMapper' });
        });
        
        document.getElementById('openTopology').addEventListener('click', () => {
          vscode.postMessage({ command: 'openTopologyViewer' });
        });
        
        document.getElementById('openSettings').addEventListener('click', () => {
          vscode.postMessage({ command: 'openSettings' });
        });
      </script>
    </body>
    </html>`;
  }
}
// Create fallback implementations for essential classes if needed
function createFallbackImplementations() {
  const fallbacks = {};
  
  fallbacks.Credential = function(options = {}) {
    if (!(this instanceof fallbacks.Credential)) {
      return new fallbacks.Credential(options);
    }
    
    this.username = options.username;
    this.password = options.password || null;
    this.keyFile = options.keyFile || null;
    this.keyPassphrase = options.keyPassphrase || null;
    this.port = options.port || 22;
    this.enablePassword = options.enablePassword || null;
    this.authPriority = options.authPriority || 0;
  };
  
  fallbacks.ParseMethod = {
    TEXTFSM: 'TEXTFSM',
    REGEX: 'REGEX'
  };
  
  fallbacks.NetworkDiscovery = function(credentials, options = {}) {
    this.credentials = credentials;
    this.discoveredDevices = {};
    this.parser = new (fallbacks.ExtensibleParser || function() {
      this.templates = [];
      this.addTemplate = function() {};
      this.parse = function() { return []; };
    })();
    this.maxThreads = options.maxThreads || 10;
    this.outputFile = options.outputFile || 'network_topology.json';
    this.exclusions = options.exclusions ? options.exclusions.split(',').map(s => s.trim()) : [];
    this.progressCallback = options.progressCallback || function() {};
  };
  
  fallbacks.NetworkDiscovery.prototype.discoverSingleThreaded = async function(seedDevices, maxHops = 4) {
    console.log(`Starting discovery with ${seedDevices.length} seed devices and max hops ${maxHops}`);
    
    // Basic implementation that creates placeholder results
    const result = {};
    
    // Add seed devices to results
    for (const device of seedDevices) {
      const ip = device.ip_address;
      result[ip] = new (fallbacks.DiscoveredDevice || function(options) {
        this.hostname = options.hostname;
        this.ipAddress = options.ipAddress || options.ip_address;
        this.visited = true;
      })(device);
      
      if (this.progressCallback) {
        this.progressCallback(`Processed seed device: ${ip}`);
      }
    }
    
    // Save to JSON
    this.saveToJson();
    
    return result;
  };
  
  fallbacks.NetworkDiscovery.prototype.saveToJson = function() {
    try {
      fs.writeFileSync(this.outputFile, JSON.stringify({
        devices: this.discoveredDevices,
        metadata: {
          discovered_at: new Date().toISOString()
        }
      }, null, 2));
      
      console.log(`Saved discovery results to ${this.outputFile}`);
    } catch (error) {
      console.error(`Error saving to JSON: ${error.message}`);
    }
  };
  
  fallbacks.NetworkDiscovery.prototype.generateTopologyGraph = function() {
    return {
      nodes: Object.values(this.discoveredDevices).map(device => ({
        id: device.ipAddress,
        label: device.hostname || device.ipAddress,
        status: device.visited ? 'success' : 'pending'
      })),
      links: []
    };
  };
  
  fallbacks.ExtensibleParser = function() {
    this.templates = [];
  };
  
  fallbacks.ExtensibleParser.prototype.addTemplate = function(method, template, priority = 0, name = '') {
    this.templates.push({
      method: method,
      template: template,
      priority: priority,
      name: name
    });
    console.log(`Added template: ${name}`);
  };
  
  fallbacks.ExtensibleParser.prototype.parse = function(text) {
    console.log(`Parsing text with ${this.templates.length} templates`);
    return []; // Simple placeholder implementation
  };
  
  fallbacks.DiscoveredDevice = function(options = {}) {
    this.hostname = options.hostname;
    this.ipAddress = options.ipAddress || options.ip_address;
    this.deviceType = options.deviceType || null;
    this.platform = options.platform || null;
    this.neighbors = options.neighbors || [];
    this.parent = options.parent || null;
    this.visited = options.visited || false;
    this.failed = options.failed || false;
    this.interfaces = options.interfaces || [];
    this.hopCount = options.hopCount || 0;
  };
  
  return fallbacks;
}

// Activate extension
function activate(context) {
  console.log('Network Mapper extension is now active');
  
  try {
        const networkMapperViewProvider = new NetworkMapperViewProvider(context);

    // Load components
    const crawl4Components = loadCrawl4Components();
    const fallbacks = createFallbackImplementations();
    
    // Use real components or fallbacks
    const components = {
      NetworkDiscovery: crawl4Components?.NetworkDiscovery || fallbacks.NetworkDiscovery,
      Credential: crawl4Components?.Credential || fallbacks.Credential,
      ParseMethod: crawl4Components?.ParseMethod || fallbacks.ParseMethod
    };
    
    // Initialize the NetworkMapperPanel with components
    NetworkMapperPanel.init(components);
    
    // Initialize settings manager
    let settingsManager;
    try {
      if (typeof SettingsManager === 'function') {
        settingsManager = new SettingsManager(context);
        console.log('Settings Manager initialized successfully');
      }
    } catch (settingsError) {
      console.error('Failed to initialize Settings Manager:', settingsError);
    }
    
    // Set template path
    const templatePath = settingsManager?.getSetting('templatePath') || 
      path.join(context.extensionPath, 'templates/textfsm');
    process.env.NET_TEXTFSM = templatePath;
    console.log('TextFSM template path set to:', templatePath);
    
    // Register commands
    let openInterfaceDisposable = vscode.commands.registerCommand('networkMapper.openInterface', function() {
      try {
        NetworkMapperPanel.createOrShow(context.extensionUri, settingsManager);
      } catch (err) {
        console.error('Error opening Network Mapper panel:', err);
        vscode.window.showErrorMessage(`Error opening Network Mapper: ${err.message}`);
      }
    });
    
    context.subscriptions.push(openInterfaceDisposable);
    console.log('Registered networkMapper.openInterface command');
    
    // Register settings command if available
    if (typeof SettingsPanel === 'function') {
      let openSettingsDisposable = vscode.commands.registerCommand('networkMapper.openSettings', function() {
        try {
          SettingsPanel.createOrShow(context, settingsManager);
        } catch (err) {
          console.error('Error opening Settings panel:', err);
          vscode.window.showErrorMessage(`Error opening Settings: ${err.message}`);
        }
      });
      
      context.subscriptions.push(openSettingsDisposable);
      console.log('Registered networkMapper.openSettings command');
    } else {
      console.log('SettingsPanel not available, settings command not registered');
      
      // Provide a simple fallback for the settings command
      let fallbackSettingsDisposable = vscode.commands.registerCommand('networkMapper.openSettings', function() {
        vscode.window.showInformationMessage('Settings module is not available.');
      });
      
      context.subscriptions.push(fallbackSettingsDisposable);
    }
    
    // Register the topology viewer command - PROPERLY PLACED OUTSIDE OF CONDITIONAL BLOCKS
    let openTopologyViewer = vscode.commands.registerCommand(
      'networkMapper.openTopologyViewer',
      function() {
        try {
          const TopologyViewerPanel = require('./topologyViewer'); 

          
          // Call the createOrShow method
          TopologyViewerPanel.createOrShow(context.extensionUri);
        } catch (err) {
          console.error('Error opening Topology Viewer:', err);
          vscode.window.showErrorMessage(`Error opening Topology Viewer: ${err.message}`);
        }
      }
    );
    
    // Fixed the variable name here - use openTopologyViewer instead of openTopologyViewerCommand
    context.subscriptions.push(openTopologyViewer);
    console.log('Registered networkMapper.openTopologyViewer command');
    
    // Add the topology visualization command if needed
    let viewTopologyVisualizationCommand = vscode.commands.registerCommand(
      'networkMapper.viewTopologyVisualization',
      function() {
        try {
          if (NetworkMapperPanel.currentPanel) {
            NetworkMapperPanel.currentPanel._viewTopologyVisualization();
          } else {
            // If no panel is open, create one first, then open visualization after a delay
            NetworkMapperPanel.createOrShow(context.extensionUri, settingsManager);
            setTimeout(() => {
              if (NetworkMapperPanel.currentPanel) {
                NetworkMapperPanel.currentPanel._viewTopologyVisualization();
              }
            }, 1000); // Wait for panel to initialize
          }
        } catch (err) {
          console.error('Error opening topology visualization:', err);
          vscode.window.showErrorMessage(`Error opening topology visualization: ${err.message}`);
        }
      }
    );

    context.subscriptions.push(viewTopologyVisualizationCommand);
    console.log('Registered networkMapper.viewTopologyVisualization command');
    
  } catch (err) {
    console.error('Error during extension activation:', err);
    vscode.window.showErrorMessage(`Failed to activate Network Mapper: ${err.message}`);
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};