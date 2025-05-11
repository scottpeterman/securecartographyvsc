// networkMapperPanel.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const TopologyViewerPanel = require('./topologyViewer');
class NetworkMapperPanel {
  static currentPanel = undefined;
  static viewType = 'networkMapper';
  
  // These will be injected from extension.js
  static NetworkDiscovery = null;
  static Credential = null;
  static ParseMethod = null;

  // Initialize with required components 
  static init(components) {
    NetworkMapperPanel.NetworkDiscovery = components.NetworkDiscovery;
    NetworkMapperPanel.Credential = components.Credential;
    NetworkMapperPanel.ParseMethod = components.ParseMethod;
  }

  static createOrShow(extensionUri, settingsManager) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (NetworkMapperPanel.currentPanel) {
      NetworkMapperPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      NetworkMapperPanel.viewType,
      'Network Mapper',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media')
        ],
        retainContextWhenHidden: true
      }
    );

    NetworkMapperPanel.currentPanel = new NetworkMapperPanel(panel, extensionUri, settingsManager);
  }

  constructor(panel, extensionUri, settingsManager) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._disposables = [];
    this._discoveryInProgress = false;
    this._settingsManager = settingsManager;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    // This is a partial update to the networkMapperPanel.js file
// Find the part in the constructor where message handling is defined
// and update the switch statement to include the 'openSettings' case:

// Handle messages from the webview
this._panel.webview.onDidReceiveMessage(
  async message => {
    switch (message.command) {
      case 'startDiscovery':
        if (!this._discoveryInProgress) {
          await this._startDiscovery(message.formData);
        } else {
          vscode.window.showWarningMessage('A discovery process is already running');
          this.log('warn', 'Discovery process already running, cannot start another one');
        }
        return;
      case 'viewTopology':
        await this._viewTopology();
        return;
      case 'showError':
        vscode.window.showErrorMessage(message.message);
        this.log('error', message.message);
        return;
      case 'openSettings':
        try {
          this.log('info', 'Opening settings panel');
          vscode.commands.executeCommand('networkMapper.openSettings');
        } catch (err) {
          console.error('Error opening settings:', err);
          this.log('error', `Failed to open settings: ${err.message}`);
        }
        return;
    }
  },
  null,
  this._disposables
);
  }

  
async _viewTopologyVisualization(topologyFile) {
  this.log('info', 'Opening topology visualization');
  
  try {
    // Default to the last created topology file if none specified
    const fileToOpen = topologyFile || this._lastTopologyFile;
    
    if (!fileToOpen) {
      // If no file is specified, prompt the user to select one
      const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'JSON Files': ['json'],
          'All files': ['*']
        },
        title: 'Select Topology File to Visualize'
      });
      
      if (fileUris && fileUris.length > 0) {
        this._openTopologyViewer(fileUris[0].fsPath);
      } else {
        this.log('info', 'No topology file selected for visualization');
      }
      return;
    }
    
    // Open the specified file
    this._openTopologyViewer(fileToOpen);
    
  } catch (error) {
    this.log('error', `Error opening topology visualization: ${error.message}`);
    vscode.window.showErrorMessage(`Failed to open topology visualization: ${error.message}`);
  }
}

async _openTopologyViewer(filePath) {
  this.log('info', `Opening topology viewer with file: ${filePath}`);
  
  try {
    // First check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Topology file not found: ${filePath}`);
    }
    
    // Read the file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Try to parse the content
    let data;
    try {
      data = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(`Failed to parse topology file: ${parseError.message}`);
    }
    
    // Check file format - we need to handle different formats
    if (data.nodes && data.links) {
      // This is a graph format, convert to our map format
      this.log('info', 'Converting graph format to map format');
      const { transformGraphData } = require('./lib/topology-mapper');
      data = transformGraphData(data);
    } else if (data.devices) {
      // This is our raw device format, convert to map format
      this.log('info', 'Converting topology format to map format');
      const { transformTopologyData } = require('./lib/topology-mapper');
      data = transformTopologyData(data);
    }
    
    // Create and show the topology viewer
    TopologyViewerPanel.createOrShow(this._extensionUri);
    
    // Set the data
    setTimeout(() => {
      if (TopologyViewerPanel.currentPanel) {
        TopologyViewerPanel.currentPanel.setTopologyData(data);
        this.log('info', 'Topology data loaded into viewer');
      }
    }, 500); // Small delay to ensure panel is initialized
    
  } catch (error) {
    this.log('error', `Error in topology viewer: ${error.message}`);
    vscode.window.showErrorMessage(`Failed to open topology: ${error.message}`);
  }
}

async _viewTopology() {
  this.log('info', 'Opening file dialog to select topology file');
  
  // First ask user what they want to do
  const action = await vscode.window.showQuickPick(
    [
      { label: 'Open in Editor', description: 'Open the topology file in VS Code editor' },
      { label: 'Visualize Topology', description: 'Open in the interactive topology viewer' }
    ],
    { placeHolder: 'Select how to view the topology' }
  );
  
  if (!action) return;
  
  if (action.label === 'Visualize Topology') {
    await this._viewTopologyVisualization();
    return;
  }
  
  // Original code for opening in editor:
  const jsonFile = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'JSON Files': ['json']
    },
    title: 'Select Network Topology JSON File'
  });

  if (jsonFile && jsonFile.length > 0) {
    this.log('info', `Selected topology file: ${jsonFile[0].fsPath}`);
    
    // Open the selected file
    try {
      const document = await vscode.workspace.openTextDocument(jsonFile[0]);
      await vscode.window.showTextDocument(document);
      this.log('info', 'Topology file opened successfully');
    } catch (err) {
      this.log('error', `Error opening topology file: ${err.message}`);
      vscode.window.showErrorMessage(`Error opening topology file: ${err.message}`);
    }
  } else {
    this.log('info', 'No topology file selected');
  }
}

  async _generateVisualizationFiles(originalJsonFile, graphJsonFile) {
  try {
    this.log('info', 'Generating visualization files...');
    
    // IMPORTANT: Use absolute paths for all file operations
    const originalJsonPath = path.resolve(originalJsonFile);
    this.log('debug', `Original JSON absolute path: ${originalJsonPath}`);
    
    // Make sure we're using directory and basename from the absolute path
    const outputDir = path.dirname(originalJsonPath);
    const baseName = path.basename(originalJsonPath, '.json');
    
    // Log the output directory to verify it's correct
    this.log('debug', `Output directory: ${outputDir}`);
    this.log('debug', `Base filename: ${baseName}`);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      this.log('info', `Creating output directory: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create absolute paths for all output files
    const mappedOutputPath = path.join(outputDir, `${baseName}_map.json`);
    const drawioOutputPath = path.join(outputDir, `${baseName}.drawio`);
    const graphmlOutputPath = path.join(outputDir, `${baseName}.graphml`);
    
    // Log all output paths for verification
    this.log('debug', `Mapped JSON path: ${mappedOutputPath}`);
    this.log('debug', `Draw.io output path: ${drawioOutputPath}`);
    this.log('debug', `GraphML output path: ${graphmlOutputPath}`);
    
    // Load the visualization libraries
    const { transformTopologyData, transformGraphData } = require('./lib/topology-mapper');
    const { NetworkDrawioConverter } = require('./lib/topology_to_drawio');
    const { NetworkGraphMLExporter } = require('./lib/topology_to_graphml');
    
    // 1. Generate Standard Mapping Format
    this.log('info', 'Generating standard mapping format...');
    
    // Read the original topology file and verify it exists
    if (!fs.existsSync(originalJsonPath)) {
      throw new Error(`Original JSON file not found: ${originalJsonPath}`);
    }
    
    const originalJson = fs.readFileSync(originalJsonPath, 'utf8');
    this.log('debug', `Read ${originalJson.length} bytes from original JSON file`);
    
    const originalData = JSON.parse(originalJson);
    
    // Determine which transformation to use
    const isGraphFormat = originalData.nodes && originalData.links;
    const isTopologyFormat = originalData.devices;
    
    let mappedData;
    if (isGraphFormat) {
      this.log('debug', 'Detected graph format, transforming to mapping format...');
      mappedData = transformGraphData(originalData);
    } else if (isTopologyFormat) {
      this.log('debug', 'Detected topology format, transforming to mapping format...');
      mappedData = transformTopologyData(originalData);
    } else {
      throw new Error('Unrecognized input file format');
    }
    
    // Write the standard mapping format
    fs.writeFileSync(mappedOutputPath, JSON.stringify(mappedData, null, 2), 'utf8');
    
    // Verify the file was created
    if (fs.existsSync(mappedOutputPath)) {
      this.log('info', `Generated standard mapping file: ${mappedOutputPath}`);
    } else {
      throw new Error(`Failed to create mapped JSON file at: ${mappedOutputPath}`);
    }
    
    // 2. Generate Draw.io Format
    this.log('info', 'Generating Draw.io format...');
    
    try {
      // Create Draw.io converter (with icons enabled)
      const drawioConverter = new NetworkDrawioConverter({
        useIcons: true,
        layout: 'tree'  // Use tree layout for better visualization
      });
      
      // IMPORTANT: The convert method directly writes the file
      drawioConverter.convert(mappedData, drawioOutputPath);
      
      // Verify the file was created
      if (fs.existsSync(drawioOutputPath)) {
        this.log('info', `Generated Draw.io file: ${drawioOutputPath}`);
      } else {
        this.log('warn', `Draw.io converter did not create the file at: ${drawioOutputPath}`);
      }
    } catch (drawioError) {
      // If Draw.io conversion fails, log but continue with other formats
      this.log('error', `Error creating Draw.io file: ${drawioError.message}`);
      if (drawioError.stack) {
        this.log('debug', `Error stack: ${drawioError.stack}`);
      }
    }
    
    // 3. Generate GraphML Format
    this.log('info', 'Generating GraphML format...');
    
    try {
      // Check if icons directory exists
      const iconsDir = path.join(this._extensionUri.fsPath, 'icons_lib');
      const hasIcons = fs.existsSync(iconsDir);
      
      if (!hasIcons) {
        this.log('warn', `Icons directory not found at ${iconsDir}. Icons will not be used.`);
      }
      
      // Create GraphML exporter
      const graphmlExporter = new NetworkGraphMLExporter({
        includeEndpoints: true,
        useIcons: hasIcons,
        iconsDir: hasIcons ? iconsDir : null,
        layoutType: 'directed_tree'  // Use tree layout for better visualization
      });
      
      // Convert to GraphML format - this returns XML content, doesn't write the file
      const graphMLContent = graphmlExporter.exportToGraphML(mappedData);
      
      // Write the GraphML file ourselves
      fs.writeFileSync(graphmlOutputPath, graphMLContent, 'utf8');
      
      // Verify the file was created
      if (fs.existsSync(graphmlOutputPath)) {
        this.log('info', `Generated GraphML file: ${graphmlOutputPath}`);
      } else {
        this.log('warn', `Failed to create GraphML file at: ${graphmlOutputPath}`);
      }
    } catch (graphmlError) {
      // If GraphML conversion fails, log but continue
      this.log('error', `Error creating GraphML file: ${graphmlError.message}`);
      if (graphmlError.stack) {
        this.log('debug', `Error stack: ${graphmlError.stack}`);
      }
    }
    
    // 4. Report success to user with full paths
    const message = `Network visualization files generated:\n` +
                    `- Standard mapping: ${path.basename(mappedOutputPath)}\n` +
                    `- Draw.io diagram: ${path.basename(drawioOutputPath)}\n` +
                    `- GraphML diagram: ${path.basename(graphmlOutputPath)}`;
    
    vscode.window.showInformationMessage(message);
    
    // Return the generated file paths
    return {
      mappedFile: mappedOutputPath,
      drawioFile: drawioOutputPath,
      graphmlFile: graphmlOutputPath
    };
    
  } catch (error) {
    this.log('error', `Error generating visualization files: ${error.message}`);
    if (error.stack) {
      this.log('debug', `Error stack: ${error.stack}`);
    }
    vscode.window.showErrorMessage(`Failed to generate visualization files: ${error.message}`);
    return null;
  }
}
  
  dispose() {
    NetworkMapperPanel.currentPanel = undefined;

    // Clean up resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  // Method to send log messages to the webview
  log(level, message) {
    if (this._panel && this._panel.webview) {
      this._panel.webview.postMessage({
        command: 'log',
        level: level,
        message: message
      });
    }
    
    // Also log to VS Code console
    switch (level) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'debug':
        console.debug(message);
        break;
      default: // info and others
        console.log(message);
    }
  }

  // Add a method to pre-fill the form from saved settings
  _prefillFormFromSettings() {
    if (!this._settingsManager) return;
    
    try {
      const settings = this._settingsManager.getAllSettings();
      
      this._panel.webview.postMessage({
        command: 'prefillForm',
        formData: {
          seedDevices: settings.lastSeedDevices || '',
          credentials: settings.lastCredentials || '',
          maxHops: settings.maxHops?.toString() || '4',
          exclusions: settings.lastExclusions || '',
          outputFile: settings.lastOutputFile || 'network_topology.json'
        },
        logLevel: settings.logLevel || 'info',
        autoScroll: settings.autoScrollLogs !== false
      });
    } catch (err) {
      console.error('Error prefilling form settings:', err);
    }
  }

  // Process seed devices from form data
  _processSeedDevices(seedDevicesInput) {
    const seedDevices = [];
    const seedsArray = seedDevicesInput.split(';');
    
    this.log('debug', `Processing ${seedsArray.length} seed device entries`);
    
    for (const seedInput of seedsArray) {
      // Check if input contains a comma (hostname,ip format)
      if (seedInput.includes(',')) {
        const seedParts = seedInput.split(',');
        if (seedParts.length === 2) {
          seedDevices.push({
            hostname: seedParts[0].trim(),
            ip_address: seedParts[1].trim()
          });
          this.log('debug', `Added seed device: ${seedParts[0].trim()}, ${seedParts[1].trim()}`);
        }
      } else {
        // If no comma, treat as single IP address and leave hostname blank
        const ipAddress = seedInput.trim();
        if (ipAddress) {
          seedDevices.push({
            hostname: '',  // Empty hostname
            ip_address: ipAddress
          });
          this.log('debug', `Added seed device with IP only: ${ipAddress}`);
        }
      }
    }

    if (seedDevices.length === 0) {
      throw new Error('No valid seed devices specified');
    }

    this.log('info', `Processed ${seedDevices.length} seed devices`);
    return seedDevices;
  }

  // Process credentials from form data
  _processCredentials(credentialsInput) {
    const credentials = [];
    const credsArray = credentialsInput.split('\n').filter(line => line.trim() !== '');
    
    this.log('debug', `Processing ${credsArray.length} credential entries`);
    
    for (const credLine of credsArray) {
      // Support for username:password format
      if (credLine.includes(':')) {
        const [username, password] = credLine.split(':');
        if (username && password) {
          try {
            // Use the Credential constructor directly
            credentials.push(new NetworkMapperPanel.Credential({
              username: username.trim(),
              password: password.trim(),
              port: 22,
              enablePassword: null,
              authPriority: credentials.length
            }));
            
            this.log('debug', `Added credential for user: ${username.trim()}`);
          } catch (error) {
            this.log('warn', `Error creating credential instance: ${error.message}`);
            
            // Fallback to a plain object if the constructor fails
            credentials.push({
              username: username.trim(),
              password: password.trim(),
              port: 22,
              enablePassword: null,
              authPriority: credentials.length
            });
            
            this.log('debug', `Added credential as plain object for user: ${username.trim()}`);
          }
        } else {
          this.log('warn', `Invalid credential format: ${credLine}`);
        }
      }
    }
    
    if (credentials.length === 0) {
      throw new Error('No valid credentials found');
    }
    
    this.log('info', `Processed ${credentials.length} credentials`);
    return credentials;
  }

  // Check if templates directory exists
  _checkTemplateDirectory(templatePath) {
    try {
      const stats = fs.statSync(templatePath);
      if (!stats.isDirectory()) {
        this.log('warn', `Template path exists but is not a directory: ${templatePath}`);
        return false;
      } else {
        const templates = fs.readdirSync(templatePath);
        this.log('info', `Found ${templates.length} templates in ${templatePath}`);
        templates.forEach(template => {
          this.log('debug', `  Template: ${template}`);
        });
        return true;
      }
    } catch (err) {
      this.log('warn', `Template directory not found at: ${templatePath}. Error: ${err.message}`);
      return false;
    }
  }

  // Create a NetworkDiscovery instance
  _createNetworkDiscovery(credentials, options) {
    this.log('debug', `Creating NetworkDiscovery instance with ${credentials.length} credentials`);
    
    try {
      // Create the instance with proper error handling
      const discovery = new NetworkMapperPanel.NetworkDiscovery(credentials, options);
      this.log('info', 'NetworkDiscovery instance created successfully');
      return discovery;
    } catch (error) {
      this.log('error', `Error creating NetworkDiscovery instance: ${error.message}`);
      throw error;
    }
  }

  // Setup custom logger for NetworkDiscovery
  _setupCustomLogger(discovery) {
    // Create a custom logger that integrates with VS Code
    const extensionLogger = {
      debug: (msg) => this.log('debug', msg),
      info: (msg) => this.log('info', msg),
      warning: (msg) => this.log('warn', msg),
      error: (msg) => this.log('error', msg)
    };
    
    // Inject our logger if possible
    if (discovery.logger) {
      this.log('debug', 'Patching NetworkDiscovery logger');
      discovery.logger = extensionLogger;
    } else {
      this.log('debug', 'Creating global logger for NetworkDiscovery');
      // If discovery doesn't have a logger prop, we can still possibly patch the global logger
      try {
        global.logger = extensionLogger;
      } catch (logErr) {
        this.log('warn', `Unable to set global logger: ${logErr.message}`);
      }
    }
    
    return discovery;
  }

  // Add custom templates to the parser
  _addCustomTemplates(discovery) {
    try {
      this.log('info', 'Adding custom regex templates');
      
      if (typeof discovery.parser !== 'object' || discovery.parser === null) {
        this.log('warn', 'Parser is not an object, cannot add templates');
        return false;
      }
      
      if (typeof discovery.parser.addTemplate !== 'function') {
        this.log('warn', 'Parser does not have an addTemplate function');
        return false;
      }
      
      discovery.parser.addTemplate(
        NetworkMapperPanel.ParseMethod.REGEX,
        'hostname\\s+(?<hostname>\\S+)',
        0,
        'hostname_regex'
      );
      
      return true;
    } catch (error) {
      this.log('warn', `Error adding custom templates: ${error.message}`);
      return false;
    }
  }

  // Ensure the output directory exists
  _ensureOutputDirectory(outputFilePath) {
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
      this.log('info', `Creating output directory: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
      return true;
    }
    return false;
  }

  // Main discovery method
  async _startDiscovery(formData) {
    // Save form values for next time
    if (this._settingsManager) {
      this._settingsManager.updateLastUsedValues(formData);
    }

    this._discoveryInProgress = true;
    this.log('info', 'Starting discovery process...');
    
    // Progress callback that will send messages to both progress and log
    const sendProgress = (message) => {
      this._panel.webview.postMessage({
        command: 'discoveryProgress',
        message: message
      });
      
      this.log('info', message);
    };
    
    try {
      // Process seed devices
      const seedDevices = this._processSeedDevices(formData.seedDevices);
      
      // Process credentials
      const credentials = this._processCredentials(formData.credentials);
      
      // Check template directory
      let templatePath = process.env.NET_TEXTFSM;
      if (this._settingsManager) {
        // Use template path from settings if available
        templatePath = this._settingsManager.getSetting('templatePath') || templatePath;
      }
      this._checkTemplateDirectory(templatePath);
      
      // Get output directory from settings if available
      let outputFile = formData.outputFile;
      if (this._settingsManager && !path.isAbsolute(outputFile)) {
        const outputDir = this._settingsManager.getSetting('outputDirectory');
        if (outputDir) {
          outputFile = path.join(outputDir, outputFile);
        }
      }

      // Ensure output directory exists if specified
      if (outputFile) {
        this._ensureOutputDirectory(outputFile);
      }
      
      // Get settings for network discovery
      const maxThreads = this._settingsManager ? 
        this._settingsManager.getSetting('maxThreads') || 1 : 1;
      
      // Create the NetworkDiscovery instance
      const discovery = this._createNetworkDiscovery(credentials, {
        maxThreads: maxThreads,
        outputFile: outputFile || 'network_topology.json',
        exclusions: formData.exclusions || '',
        progressCallback: sendProgress
      });
      
      // Setup custom logging
      this._setupCustomLogger(discovery);
      
      // Add custom templates
      this._addCustomTemplates(discovery);
      
      // Log the discovery parameters
      this.log('info', `Starting discovery with max hops: ${formData.maxHops}`);
      this.log('info', `Output file set to: ${outputFile}`);
      if (formData.exclusions) {
        this.log('info', `Exclusion patterns: ${formData.exclusions}`);
      }
      
      // Verify that the discoverSingleThreaded method exists
      if (typeof discovery.discoverSingleThreaded !== 'function') {
        this.log('error', 'NetworkDiscovery.discoverSingleThreaded is not a function - implementation may be incorrect');
        throw new Error('NetworkDiscovery implementation is missing required methods');
      }
      
      // Run discovery
      sendProgress('Starting network discovery...');
      const maxHops = parseInt(formData.maxHops) || 4;
      
      this.log('info', 'Starting discovery with discoverSingleThreaded...');
      const discovered = await discovery.discoverSingleThreaded(seedDevices, maxHops);
      
      // If we get here, the discovery was successful
      this.log('info', 'Discovery process completed successfully');
      
      // Generate summary
      const totalDevices = Object.keys(discovered).length;
      const successful = Object.values(discovered).filter(d => d.visited && !d.failed).length;
      const failed = Object.values(discovered).filter(d => d.failed).length;
      
      this.log('info', `Discovered ${totalDevices} total devices`);
      this.log('info', `Successfully scanned: ${successful}`);
      this.log('info', `Failed to scan: ${failed}`);
      
      sendProgress('Generating topology data...');
      
      // Generate topology graph
      this.log('info', 'Generating topology graph');
      const graphData = discovery.generateTopologyGraph();
      const outputDir = path.dirname(outputFile);
      const graphFilePath = path.join(outputDir, 'network_topology_graph.json');
      
      // Ensure output directory exists
      this._ensureOutputDirectory(outputFile);
      
      // Write the graph data
      this.log('info', `Writing topology graph to: ${graphFilePath}`);
      fs.writeFileSync(graphFilePath, JSON.stringify(graphData, null, 2));
      this.log('info', 'Starting automatic visualization generation...');
try {
  await this._generateVisualizationFiles(outputFile, graphFilePath);
} catch (vizError) {
  this.log('error', `Error during visualization generation: ${vizError.message}`);
  // Don't fail the discovery process if visualization fails
}
      
      this.log('info', `Writing topology data to: ${outputFile}`);
      // discovery.saveToJson() should already have been called by the discovery process
      
      sendProgress('Network discovery completed successfully!');

      // Update webview with results
      this._panel.webview.postMessage({
        command: 'discoveryComplete',
        results: {
          totalDevices,
          successful,
          failed,
          outputFile: outputFile,
          graphFile: graphFilePath
        }
      });
    } catch (error) {
      this.log('error', `Discovery failed: ${error.message}`);
      if (error.stack) {
        this.log('debug', `Error stack: ${error.stack}`);
      }
      this.log('info', 'Starting automatic visualization generation...');

      vscode.window.showErrorMessage(`Discovery failed: ${error.message}`);
      this._panel.webview.postMessage({
        command: 'discoveryError',
        error: error.message
      });
    } finally {
      this._discoveryInProgress = false;
      this.log('info', 'Discovery process finished');
    }
  }

// In networkMapperPanel.js, update the _viewTopology method

// In networkMapperPanel.js, update the _viewTopology method
async _viewTopology() {
  this.log('info', 'Opening file dialog to select topology file');
  
  // Get default directory from settings
  let defaultDirectory = undefined;
  if (this._settingsManager) {
    const outputDir = this._settingsManager.getSetting('outputDirectory');
    if (outputDir && fs.existsSync(outputDir)) {
      defaultDirectory = vscode.Uri.file(outputDir);
      this.log('debug', `Using default directory from settings: ${outputDir}`);
    }
  }
  
  // First ask user what they want to do
  const action = await vscode.window.showQuickPick(
    [
      { label: 'Open in Editor', description: 'Open the topology file in VS Code editor' },
      { label: 'Visualize Topology', description: 'Open in the interactive topology viewer' }
    ],
    { placeHolder: 'Select how to view the topology' }
  );
  
  if (!action) return;
  
  if (action.label === 'Visualize Topology') {
    // Open file dialog to select a topology file
    const jsonFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: defaultDirectory,
      filters: {
        'JSON Files': ['json']
      },
      title: 'Select Network Topology JSON File'
    });
    
    if (jsonFile && jsonFile.length > 0) {
      this.log('info', `Selected topology file for visualization: ${jsonFile[0].fsPath}`);
      await this._viewTopologyVisualization(jsonFile[0].fsPath);
    } else {
      this.log('info', 'No topology file selected');
    }
    return;
  }
  
  // Original code for opening in editor (with added defaultUri):
  const jsonFile = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: defaultDirectory,
    filters: {
      'JSON Files': ['json']
    },
    title: 'Select Network Topology JSON File'
  });

  if (jsonFile && jsonFile.length > 0) {
    this.log('info', `Selected topology file: ${jsonFile[0].fsPath}`);
    
    // Open the selected file
    try {
      const document = await vscode.workspace.openTextDocument(jsonFile[0]);
      await vscode.window.showTextDocument(document);
      this.log('info', 'Topology file opened successfully');
    } catch (err) {
      this.log('error', `Error opening topology file: ${err.message}`);
      vscode.window.showErrorMessage(`Error opening topology file: ${err.message}`);
    }
  } else {
    this.log('info', 'No topology file selected');
  }
}

  _update() {
    const webview = this._panel.webview;
    this._panel.title = "Network Mapper";
    this._panel.webview.html = this._getHtmlForWebview(webview);
    
    // Wait a bit for the webview to initialize before sending settings
    if (this._settingsManager) {
      setTimeout(() => {
        this._prefillFormFromSettings();
      }, 500);
    }
  }

  _getHtmlForWebview(webview) {
    try {
      // Get paths to the webview resources
      const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js')
      );
      const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.css')
      );
      
      // Get the HTML template
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html').fsPath;
      console.log('Looking for HTML template at:', htmlPath);
      
      if (!fs.existsSync(htmlPath)) {
        console.error(`HTML template not found at: ${htmlPath}`);
        throw new Error(`HTML template not found at: ${htmlPath}`);
      }
      
      let html = fs.readFileSync(htmlPath, 'utf8');
      
      // Define the Content Security Policy allowing Eruda
      const csp = `
        default-src 'none'; 
        style-src ${webview.cspSource}; 
        script-src ${webview.cspSource} https://cdn.jsdelivr.net 'unsafe-inline'; 
        connect-src https://cdn.jsdelivr.net;
        img-src ${webview.cspSource} data:;
      `;
      
      // Replace the CSP placeholder with the actual CSP
      html = html.replace(/content="(.*?)"/, `content="${csp.replace(/\s+/g, ' ')}"`);
      
      // Replace other placeholders
      html = html.replace(/\${webview.cspSource}/g, webview.cspSource);
      html = html.replace(/\${scriptUri}/g, scriptUri);
      html = html.replace(/\${styleUri}/g, styleUri);
      
      return html;
    } catch (error) {
      console.error(`Error loading webview HTML: ${error.message}`);
      
      // Fallback HTML if we can't load the template
      return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'unsafe-inline';">
        <title>Network Mapper</title>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          .error { color: var(--vscode-errorForeground); }
        </style>
      </head>
      <body>
        <h2>Network Mapper</h2>
        <p class="error">Error loading the Network Mapper interface. Please check the console for details.</p>
        <p>Error: ${error.message}</p>
        <script>
          console.error("Error loading Network Mapper:", ${JSON.stringify(error.message)});
        </script>
      </body>
      </html>`;
    }
  }
}

module.exports = NetworkMapperPanel;