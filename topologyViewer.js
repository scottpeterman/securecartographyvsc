// At the top of topologyViewer.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Network interface name normalizer for consistent representation
 * across different platforms like Cisco IOS, NX-OS, and Arista.
 */
class InterfaceNormalizer {
    /**
     * Initialize the normalizer with platform recognition and interface patterns
     */
    constructor() {
        // Management interface synonyms
        this.MGMT_SYNONYMS = [
            /^(?:ma)/i,
            /^(?:oob)/i,
            /^(?:oob_management)/i,
            /^(?:management)/i,
            /^(?:mgmt)/i,
        ];

        // Interface specifications with regex patterns
        this.INTERFACE_SPECS = [
            // Standard Ethernet interfaces
            {
                pattern: /^(?:eth|et|ethernet)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "Ethernet$1",
                shortName: "Eth$1"
            },
            // Gigabit interfaces
            {
                pattern: /^(?:gi|gige|gigabiteth|gigabitethernet|gigabit)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "GigabitEthernet$1",
                shortName: "Gi$1"
            },
            // Ten-Gigabit interfaces
            {
                pattern: /^(?:te|tengig|tengige|tengigabitethernet|tengigabit)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "TenGigabitEthernet$1",
                shortName: "Te$1"
            },
            // 25-Gigabit interfaces
            {
                pattern: /^(?:twe|twentyfivegig|twentyfivegige|twentyfivegigabitethernet)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "TwentyFiveGigE$1",
                shortName: "Twe$1"
            },
            // 40-Gigabit interfaces
            {
                pattern: /^(?:fo|fortygig|fortygige|fortygigabitethernet)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "FortyGigabitEthernet$1",
                shortName: "Fo$1"
            },
            // 100-Gigabit interfaces
            {
                pattern: /^(?:hu|hun|hundredgig|hundredgige|hundredgigabitethernet|100gig)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "HundredGigabitEthernet$1",
                shortName: "Hu$1"
            },
            // Port channels
            {
                pattern: /^(?:po|portchannel|port-channel|port_channel)(\d+)/i,
                longName: "Port-Channel$1",
                shortName: "Po$1"
            },
            // Management interfaces (with number)
            {
                pattern: /^(?:ma|mgmt|management|oob_management|oob|wan)(\d+(?:\/\d+)*)/i,
                longName: "Management$1",
                shortName: "Ma$1"
            },
            // Management interfaces (without number)
            {
                pattern: /^(?:ma|mgmt|management|oob_management|oob|wan)$/i,
                longName: "Management",
                shortName: "Ma"
            },
            // VLAN interfaces
            {
                pattern: /^(?:vl|vlan)(\d+)/i,
                longName: "Vlan$1",
                shortName: "Vl$1"
            },
            // Loopback interfaces
            {
                pattern: /^(?:lo|loopback)(\d+)/i,
                longName: "Loopback$1",
                shortName: "Lo$1"
            },
            // FastEthernet interfaces (legacy)
            {
                pattern: /^(?:fa|fast|fastethernet)(\d+(?:\/\d+)*)/i,
                longName: "FastEthernet$1",
                shortName: "Fa$1"
            }
        ];
    }

    /**
     * Normalize interface names to a consistent format
     * @param {string} interfaceName - Interface name to normalize
     * @param {string} platform - Optional platform type
     * @param {boolean} useShortName - Whether to use short interface names
     * @returns {string} Normalized interface name
     */
    normalize(interfaceName, platform = null, useShortName = true) {
        if (!interfaceName) {
            return "";
        }

        // Handle space-separated hostname
        if (interfaceName.includes(" ")) {
            const parts = interfaceName.split(" ");
            interfaceName = parts[parts.length - 1];
        }

        // Handle hyphenated hostname
        if (interfaceName.includes("-")) {
            const parts = interfaceName.split("-");
            // Only split on the last hyphen if it seems to separate a device and interface
            if (parts.length >= 2 && /^[a-zA-Z]+\d/.test(parts[parts.length - 1])) {
                interfaceName = parts[parts.length - 1];
            }
        }

        // Convert to lowercase for consistent matching
        interfaceName = interfaceName.toLowerCase().trim();

        // Check if it's a management interface variant
        for (const mgmtPattern of this.MGMT_SYNONYMS) {
            if (mgmtPattern.test(interfaceName)) {
                // Extract any numbers if present
                const numbers = interfaceName.match(/\d+(?:\/\d+)*$/);
                const suffix = numbers ? numbers[0] : "";
                return useShortName ? `Ma${suffix}` : `Management${suffix}`;
            }
        }

        // Try to match and normalize the interface name
        for (const spec of this.INTERFACE_SPECS) {
            if (spec.pattern.test(interfaceName)) {
                const replacement = useShortName ? spec.shortName : spec.longName;
                return interfaceName.replace(spec.pattern, replacement);
            }
        }

        return interfaceName;
    }

    /**
     * Determine the platform type from a platform string
     * @param {string} platformStr - Platform description string
     * @returns {string} Platform type identifier
     */
    detectPlatform(platformStr) {
        if (!platformStr) {
            return "UNKNOWN";
        }
        
        const lowerPlatform = platformStr.toLowerCase();
        
        if (lowerPlatform.includes("cisco ios")) {
            return "CISCO_IOS";
        } else if (lowerPlatform.includes("nexus") || lowerPlatform.includes("nxos")) {
            return "CISCO_NXOS";
        } else if (lowerPlatform.includes("arista")) {
            return "ARISTA";
        }
        
        return "UNKNOWN";
    }
}

class TopologyViewerPanel {
    static currentPanel = undefined;
    static viewType = 'networkTopologyViewer';

    /**
     * Create or show the topology viewer panel
     * @param {vscode.ExtensionContext} extensionUri - Extension context
     */
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (TopologyViewerPanel.currentPanel) {
            TopologyViewerPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            TopologyViewerPanel.viewType,
            'Network Topology Viewer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        TopologyViewerPanel.currentPanel = new TopologyViewerPanel(panel, extensionUri);
    }

    /**
     * Revive the panel
     * @param {vscode.WebviewPanel} panel - Panel to revive
     * @param {vscode.ExtensionContext} extensionUri - Extension context
     */
    static revive(panel, extensionUri) {
        TopologyViewerPanel.currentPanel = new TopologyViewerPanel(panel, extensionUri);
    }

    /**
     * Create a new topology viewer panel
     * @param {vscode.WebviewPanel} panel - Panel to use
     * @param {vscode.ExtensionContext} extensionUri - Extension context
     */
    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._disposables = [];
        this._topologyData = null;
        this._darkMode = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        this._layout = 'TD';
        this._interfaceNormalizer = new InterfaceNormalizer();
        

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            (_) => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'openFile':
                        this.openFile();
                        return;
                    case 'saveFile':
                        this.saveFile();
                        return;
                    case 'changeLayout':
                        this._layout = message.layout;
                        this.renderDiagram();
                        return;
                }
            },
            null,
            this._disposables
        );

        // Listen for theme changes
        vscode.window.onDidChangeActiveColorTheme((e) => {
            this._darkMode = e.kind === vscode.ColorThemeKind.Dark;
            this._update();
        }, null, this._disposables);
    }

    /**
     * Set the topology data
     * @param {Object} data - Topology data
     */
    setTopologyData(data) {
        this._topologyData = data;
        this.renderDiagram();
    }

    /**
     * Open a topology file
     */
    async openFile() {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Open Topology File',
            filters: {
                'JSON files': ['json'],
                'All files': ['*']
            }
        });

        if (fileUri && fileUri[0]) {
            const document = await vscode.workspace.openTextDocument(fileUri[0]);
            const content = document.getText();
            
            try {
                this._topologyData = JSON.parse(content);
                this.renderDiagram();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to parse topology file: ${error.message}`);
            }
        }
    }

    /**
     * Save the diagram to a file
     */
    async saveFile() {
        if (!this._topologyData) {
            vscode.window.showWarningMessage("No diagram to save!");
            return;
        }

        const fileUri = await vscode.window.showSaveDialog({
            saveLabel: 'Save Diagram',
            filters: {
                'HTML files': ['html'],
                'All files': ['*']
            }
        });

        if (fileUri) {
            try {
                const htmlContent = this.generateFullHtml(this.generateMermaid());
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(htmlContent, 'utf8'));
                vscode.window.showInformationMessage('Diagram saved successfully!');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to save file: ${error.message}`);
            }
        }
    }

    /**
     * Render the diagram
     */
    renderDiagram() {
        if (this._topologyData) {
            const mermaidCode = this.generateMermaid();
            const graph = this.analyzeTopology();
            const nodeList = Object.keys(graph.nodes);
            
            this._panel.webview.postMessage({
                command: 'updateDiagram',
                mermaidCode: mermaidCode,
                nodeList: nodeList
            });
        }
    }

    /**
     * Analyze the topology data
     * @returns {Object} Graph data with nodes and edges
     */
    
analyzeTopology() {
    const graph = {
        nodes: {},
        edges: []
    };

    // Return empty graph if no topology data
    if (!this._topologyData) {
        return graph;
    }

    // First pass: add all nodes from the topologyData
    for (const [node, data] of Object.entries(this._topologyData)) {
        const platform = data.node_details?.platform || '';
        const platformType = this._interfaceNormalizer.detectPlatform(platform);
        
        graph.nodes[node] = {
            ip: data.node_details?.ip || '',
            platform: platform,
            platformType: platformType,
            connections: 0,
            is_leaf: false
        };
    }

    // Rest of the method remains unchanged...
    // Second pass: process all connections and normalize interface names
    const processedConnections = new Map();
    
    for (const [node, data] of Object.entries(this._topologyData)) {
        for (const [peer, peerData] of Object.entries(data.peers || {})) {
            // Add peer to nodes if not already present
            if (!graph.nodes[peer]) {
                const peerPlatform = peerData.platform || '';
                const peerPlatformType = this._interfaceNormalizer.detectPlatform(peerPlatform);
                
                graph.nodes[peer] = {
                    ip: peerData.ip || '',
                    platform: peerPlatform,
                    platformType: peerPlatformType,
                    connections: 0,
                    is_leaf: true // Not in main topology data
                };
            }
            
            // Create a sorted connection key to ensure consistent handling
            const connectionKey = [node, peer].sort().join('::');
            
            // Process all connection interfaces
            const connectionInterfaces = [];
            const connections = peerData.connections || [];
            
            for (const [localIf, remoteIf] of connections) {
                // Normalize both interfaces
                const normalizedLocalIf = this._interfaceNormalizer.normalize(localIf, graph.nodes[node].platformType);
                const normalizedRemoteIf = this._interfaceNormalizer.normalize(remoteIf, graph.nodes[peer].platformType);
                
                connectionInterfaces.push([normalizedLocalIf, normalizedRemoteIf]);
            }
            
            // If this connection is not yet processed
            if (!processedConnections.has(connectionKey)) {
                processedConnections.set(connectionKey, {
                    source: node,
                    target: peer,
                    interfaces: connectionInterfaces
                });
                
                // Count connections for role determination
                graph.nodes[node].connections++;
                graph.nodes[peer].connections++;
            } else {
                // Merge interfaces if connection already exists
                const existingConnection = processedConnections.get(connectionKey);
                
                // Add new interfaces that aren't duplicates
                for (const [localIf, remoteIf] of connectionInterfaces) {
                    const isDuplicate = existingConnection.interfaces.some(
                        ([existingLocal, existingRemote]) => 
                            (existingLocal === localIf && existingRemote === remoteIf) ||
                            (existingLocal === remoteIf && existingRemote === localIf)
                    );
                    
                    if (!isDuplicate) {
                        existingConnection.interfaces.push([localIf, remoteIf]);
                    }
                }
            }
        }
    }
    
    // Determine node roles based on name patterns and connectivity
    for (const [node, data] of Object.entries(graph.nodes)) {
        // Determine role based on name pattern
        if (node.includes('-core-')) {
            data.role = 'core';
        } else if (node.includes('-rtr-')) {
            data.role = 'gateway';
        } else if (node.includes('-access-')) {
            data.role = 'edge';
        } else if (node.includes('arista')) {
            data.role = 'edge';
        } else {
            // Fallback to connectivity-based role
            if (data.connections > 4) {
                data.role = 'core';
            } else if (data.connections > 2) {
                data.role = 'gateway';
            } else {
                data.role = 'edge';
            }
        }
    }
    
    // Convert processed connections to edges
    graph.edges = Array.from(processedConnections.values());
    
    return graph;
}


    /**
     * Generate Mermaid diagram code
     * @returns {string} Mermaid diagram code
     */
    generateMermaid() {
    if (!this._topologyData) {
        return "graph TD\nA[No data loaded]";
    }

    const graph = this.analyzeTopology();
    const lines = [`graph ${this._layout}`];

    // Style definitions
    lines.push(`classDef core fill:#ff9966,stroke:#333,stroke-width:2px,color:#000;`);
    lines.push(`classDef edge fill:#6699ff,stroke:#333,stroke-width:1px,color:#000;`);
    lines.push(`classDef gateway fill:#66ff99,stroke:#333,stroke-width:1.5px,color:#000;`);
    lines.push(`classDef highlighted fill:#4ade80,stroke:#000,stroke-width:4px,color:#000;`);

    // Group nodes by site
    const siteGroups = {};
    for (const [nodeId, nodeData] of Object.entries(graph.nodes)) {
        const siteParts = nodeId.split('-');
        if (siteParts.length > 1) {
            const site = siteParts[0];
            if (!siteGroups[site]) {
                siteGroups[site] = [];
            }
            siteGroups[site].push(nodeId);
        }
    }

    // Add subgraphs for sites
    for (const [site, nodes] of Object.entries(siteGroups)) {
        if (nodes.length > 1) {
            lines.push(`subgraph ${site}`);
            
            // Add nodes for this site
            for (const nodeId of nodes) {
                const nodeData = graph.nodes[nodeId];
                const sanitizedId = nodeId.replace(/-/g, '_');
                
                const nodeInfo = [nodeId];
                if (nodeData.ip) {
                    nodeInfo.push(`IP: ${nodeData.ip}`);
                }
                
                const role = nodeData.role || 'edge';
                lines.push(`  ${sanitizedId}["${nodeInfo.join('<br>')}"]:::${role}`);
            }
            
            lines.push(`end`);
        }
    }
    
    // Add nodes not in any site group
    for (const [nodeId, nodeData] of Object.entries(graph.nodes)) {
        const siteParts = nodeId.split('-');
        if (siteParts.length <= 1 || !siteGroups[siteParts[0]] || !siteGroups[siteParts[0]].includes(nodeId)) {
            const sanitizedId = nodeId.replace(/-/g, '_');
            const nodeInfo = [nodeId];
            if (nodeData.ip) {
                nodeInfo.push(`IP: ${nodeData.ip}`);
            }
            
            const role = nodeData.role || 'edge';
            lines.push(`${sanitizedId}["${nodeInfo.join('<br>')}"]:::${role}`);
        }
    }

    // Add edges with improved connection information
    for (const edge of graph.edges) {
        const sourceId = edge.source.replace(/-/g, '_');
        const targetId = edge.target.replace(/-/g, '_');
        
        // Format connection label based on number of interfaces
        let label = '';
        if (edge.interfaces && edge.interfaces.length > 0) {
            if (edge.interfaces.length === 1) {
                // Single connection - show the interface names
                label = `${edge.interfaces[0][0]} - ${edge.interfaces[0][1]}`;
            } else {
                // Multiple connections - show count
                label = `${edge.interfaces.length} links`;
            }
        }
        
        if (label) {
            lines.push(`${sourceId} <-->|"${label}"| ${targetId}`);
        } else {
            lines.push(`${sourceId} <--> ${targetId}`);
        }
    }

    return lines.join('\n');
}

    /**
     * Dispose of the panel
     */
    dispose() {
        TopologyViewerPanel.currentPanel = undefined;
    
        // Clean up resources
        this._panel.dispose();
    
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Generate full HTML page
     * @param {string} mermaidCode - Mermaid diagram code
     * @returns {string} HTML content
     */
    generateFullHtml(mermaidCode) {
        const theme = this._darkMode ? "dark" : "default";
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Network Topology</title>
            <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
            <script>
                mermaid.initialize({
                    startOnLoad: true,
                    theme: '${theme}',
                    securityLevel: 'loose',
                    flowchart: {
                        curve: 'basis',
                        padding: 20
                    },
                    maxTextSize: 100000
                });
            </script>
            <style>
                body {
                    margin: 0;
                    padding: 10px;
                    background-color: ${this._darkMode ? '#1a1a1a' : '#ffffff'};
                }
                .mermaid {
                    transform-origin: 0 0;
                }
            </style>
        </head>
        <body>
            <div class="mermaid" id="mermaidDiagram">
                ${mermaidCode}
            </div>
        </body>
        </html>`;
    }

    /**
     * Get HTML content for the webview
     * @returns {string} HTML content
     */
    
_getHtmlContent() {
    // Read HTML template file
    const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'html', 'topology-viewer.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Get the mermaid diagram code
    const mermaidCode = this._topologyData ? this.generateMermaid() : "graph TD\nA[No data loaded]";
    
    // Get webview URIs for resources
    const cssUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'media', 'css', 'topology-viewer.css')
    );
    
    const jsUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'media', 'js', 'topology-viewer.js')
    );
    
    // Inject resources (CSS)
    htmlContent = htmlContent.replace(
        '<!-- CSS will be injected by VSCode extension -->', 
        `<link rel="stylesheet" href="${cssUri}">`
    );
    
    // Inject resources (JavaScript) - only do this once
    htmlContent = htmlContent.replace(
        '<!-- JavaScript will be injected by VSCode extension -->', 
        `<script src="${jsUri}"></script>`
    );
    
    // Set the layout select value
    const layoutSelectRegex = new RegExp(`value="${this._layout}"`, 'g');
    htmlContent = htmlContent.replace(layoutSelectRegex, `value="${this._layout}" selected`);
    
    // Only analyze topology if data is available
    let nodeList = [];
    if (this._topologyData) {
        const graph = this.analyzeTopology();
        nodeList = Object.keys(graph.nodes);
    }
    
    // Replace the node-list content
    if (nodeList.length > 0) {
        const nodeListHtml = nodeList.map(node => 
            `<li class="node-item" onclick="highlightNode('${node.replace(/'/g, "\\'")}')">${node}</li>`
        ).join('');
        
        htmlContent = htmlContent.replace(
            '<li class="node-item">No devices loaded</li>',
            nodeListHtml
        );
    }
    
    // Replace the mermaid diagram
    htmlContent = htmlContent.replace(
        'graph TD\nA[No data loaded]',
        mermaidCode
    );
    
    return htmlContent;
}

    /**
     * Update the webview content
     */
    _update() {
        try {
            this._panel.webview.html = this._getHtmlContent();
        } catch (error) {
            // Fallback to inline HTML if file loading fails
            this._panel.webview.html = `<!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Error Loading Network Topology Viewer</title>
                </head>
                <body>
                    <h1>Error Loading Viewer</h1>
                    <p>Failed to load the network topology viewer template: ${error}</p>
                    <p>Please make sure the media files are correctly installed.</p>
                </body>
            </html>`;
            
            console.error("Error loading topology viewer template:", error);
        }
    }
}

module.exports = TopologyViewerPanel;