#!/usr/bin/env node

/**
 * Enhanced Network Topology to Draw.io Converter
 * --------------------------------------------
 * Converts network_map.json to Draw.io XML format
 * Uses Draw.io's built-in Cisco network shapes
 * ENHANCED: Ensures all nodes are visualized regardless of connectivity
 * ENHANCED: Adds interface name normalization for consistent representation
 * 
 * Usage:
 *    node enhanced_topology_to_drawio.js <input-file> <output-file> [--icons] [--layout <type>]
 */

const fs = require('fs');
const path = require('path');

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

// Main class for network topology to Draw.io conversion
class NetworkDrawioConverter {
  constructor(options = {}) {
    this.useIcons = options.useIcons || false;
    this.layoutType = options.layout || 'tree';
    this.nextId = 2; // Start after root cells
    this.processedConnections = new Set();
    
    // Initialize the interface normalizer
    this.interfaceNormalizer = new InterfaceNormalizer();
    
    // Layout config
    this.startX = 1000;
    this.startY = 350;
    this.horizontalSpacing = 200;
    this.verticalSpacing = 150;
  }
  
  // Convert network topology to Draw.io format
  convert(networkData, outputPath) {
    console.log('Converting to Draw.io format...');
    try {
      // Build edges list for layout
      const edges = [];
      for (const [sourceId, sourceData] of Object.entries(networkData)) {
        if (sourceData.peers) {
          for (const targetId of Object.keys(sourceData.peers)) {
            if (networkData[targetId]) {
              edges.push([sourceId, targetId]);
            }
          }
        }
      }
      
      // Calculate node positions - ENHANCED to ensure all nodes are included
      const nodePositions = this.calculateLayoutWithAllNodes(networkData, edges);
      
      // Create XML content
      let xml = '<?xml version="1.0" ?>\n';
      xml += '<mxfile host="app.diagrams.net" modified="' + new Date().toISOString() + 
             '" agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) draw.io/21.2.1 Chrome/112.0.5615.87 Electron/24.1.2 Safari/537.36" ' +
             'version="21.2.1" type="device">\n';
      xml += '  <diagram id="network_topology" name="Network Topology">\n';
      xml += '    <mxGraphModel dx="1000" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" ' +
             'arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">\n';
      xml += '      <root>\n';
      xml += '        <mxCell id="0"/>\n';
      xml += '        <mxCell id="root_1" parent="0"/>\n';
      
      // Add nodes - ENHANCED to log node creation
      const nodeElements = {};
      console.log('Adding nodes to diagram:');
      for (const [nodeId, [x, y]] of Object.entries(nodePositions)) {
        const nodeData = networkData[nodeId];
        const cellId = this.addNode(nodeId, nodeData, x, y);
        xml += cellId.xml;
        nodeElements[nodeId] = cellId.id;
        console.log(`  - Added node: ${nodeId} (${nodeData?.node_details?.ip || 'unknown IP'})`);
      }
      
      // Check if all nodes were included - ENHANCED validation
      const missingNodes = Object.keys(networkData).filter(nodeId => !(nodeId in nodeElements));
      if (missingNodes.length > 0) {
        console.warn('WARNING: Some nodes were not included in the diagram:');
        missingNodes.forEach(nodeId => console.warn(`  - ${nodeId}`));
      } else {
        console.log('All nodes from the input data were included in the diagram.');
      }
      
      // Add edges
      console.log('Adding connections:');
      for (const [sourceId, sourceData] of Object.entries(networkData)) {
        if (sourceData.peers) {
          for (const [targetId, peerData] of Object.entries(sourceData.peers)) {
            if (sourceId in nodeElements && targetId in nodeElements) {
              if (peerData.connections) {
                for (const [localPort, remotePort] of peerData.connections) {
                  // Create unique connection key to avoid duplicates
                  const connKey = JSON.stringify([sourceId, targetId, localPort, remotePort].sort());
                  if (!this.processedConnections.has(connKey)) {
                    // Detect platform types for interface normalization
                    const sourcePlatform = sourceData?.node_details?.platform || '';
                    const targetPlatform = peerData?.platform || '';
                    const sourcePlatformType = this.interfaceNormalizer.detectPlatform(sourcePlatform);
                    const targetPlatformType = this.interfaceNormalizer.detectPlatform(targetPlatform);
                    
                    // Normalize interface names
                    const normalizedLocalPort = this.interfaceNormalizer.normalize(
                      localPort, sourcePlatformType, true
                    );
                    const normalizedRemotePort = this.interfaceNormalizer.normalize(
                      remotePort, targetPlatformType, true
                    );
                    
                    xml += this.addEdge(
                      nodeElements[sourceId],
                      nodeElements[targetId],
                      normalizedLocalPort,
                      normalizedRemotePort
                    );
                    this.processedConnections.add(connKey);
                    console.log(`  - Added connection: ${sourceId}:${normalizedLocalPort} -> ${targetId}:${normalizedRemotePort}`);
                  }
                }
              }
            } else {
              console.warn(`  - Skipped connection: ${sourceId} -> ${targetId} (one or both nodes missing from diagram)`);
            }
          }
        }
      }
      
      // Close XML structure
      xml += '      </root>\n';
      xml += '    </mxGraphModel>\n';
      xml += '  </diagram>\n';
      xml += '</mxfile>';
      
      // Write to file
      fs.writeFileSync(outputPath, xml, 'utf8');
      console.log(`Successfully exported diagram to ${outputPath}`);
      console.log('Interface names were normalized for consistent representation.');
      
    } catch (error) {
      console.error(`Error: ${error.message}`);
      throw error;
    }
  }
  
  // Add a node to the diagram and return its cell ID and XML
  addNode(nodeId, nodeData, x, y) {
    const cellId = `node_${this.nextId++}`;
    
    // Get device icon based on platform
    const platform = nodeData?.node_details?.platform || '';
    const ip = nodeData?.node_details?.ip || '';
    const style = this.getDeviceStyle(nodeId, platform);
    
    // Use XML-escaped special characters
    // In Draw.io, we should just use literal newlines for text with multiple lines
    const escapedNodeId = this.escapeXml(nodeId);
    const escapedIp = this.escapeXml(ip);
    const escapedPlatform = this.escapeXml(platform);
    
    // Create node cell XML with proper line breaks
    let xml = `        <mxCell id="${cellId}" vertex="1" parent="root_1" style="${style}" value="${escapedNodeId}&#xa;${escapedIp}&#xa;${escapedPlatform}">\n`;
    xml += `          <mxGeometry x="${x}" y="${y}" width="80" height="80" as="geometry"/>\n`;
    xml += `        </mxCell>\n`;
    
    return { id: cellId, xml };
  }
  
  // Escape XML special characters
  escapeXml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  // Create edge XML
  addEdge(sourceId, targetId, localPort, remotePort) {
    const edgeId = `edge_${this.nextId++}`;
    
    // Edge style and attributes
    const style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;noEdgeStyle=1";
    
    // Edge label with normalized interface names
    const label = `${localPort} → ${remotePort}`;
    
    // Create edge XML - note the html="1" attribute to enable HTML parsing
    let xml = `        <mxCell id="${edgeId}" parent="root_1" source="${sourceId}" target="${targetId}" ` +
              `style="${style}" edge="1" noEdgeStyle="1" value="${label}" html="1">\n`;
    xml += `          <mxGeometry relative="1" as="geometry"/>\n`;
    xml += `        </mxCell>\n`;
    
    return xml;
  }
  
  // Check if string is a MAC address
  macPattern(str) {
    return /[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$|[0-9a-f]{4}([.-])[0-9a-f]{4}(\1[0-9a-f]{4})$/.test(str);
  }
  
  // Get device style based on platform type with improved pattern matching
  getDeviceStyle(nodeId, platform) {
    // Base style
    const baseStyle = "fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;html=1;" +
                      "verticalLabelPosition=bottom;verticalAlign=top;align=center";
    
    // Use standard shapes if icons disabled
    if (!this.useIcons) {
      return baseStyle;
    }
    
    // Convert to lowercase for case-insensitive matching
    const nodeIdLower = (nodeId || '').toLowerCase();
    const platformLower = (platform || '').toLowerCase();
    
    // Get shape based on device type with enhanced pattern matching
    let shape = null;
    
    // Router detection - improved patterns matching GraphML version
    if (
        nodeIdLower.includes('router') || 
        nodeIdLower.includes('rtr') || 
        nodeIdLower.match(/[^a-z]r[0-9]/) || // matches router naming patterns like r1, r2
        platformLower.includes('router') || 
        platformLower.includes('isr') || 
        platformLower.includes('asr') || 
        platformLower.includes('7200') ||
        platformLower.includes('72') || 
        platformLower.includes('cisco ios')
    ) {
      shape = "mxgraph.cisco.routers.router";
    } 
    // Switch detection - improved patterns matching GraphML version
    else if (
        nodeIdLower.includes('switch') || 
        nodeIdLower.includes('sw') ||
        nodeIdLower.includes('core') || 
        nodeIdLower.includes('access') || 
        nodeIdLower.includes('spine') || 
        nodeIdLower.includes('leaf') ||
        nodeIdLower.includes('-sw') || 
        nodeIdLower.includes('_sw') ||
        platformLower.includes('switch') || 
        platformLower.includes('nexus') ||
        platformLower.includes('catalyst') || 
        platformLower.includes('eos') ||
        platformLower.includes('dcs') || 
        platformLower.includes('c9')
    ) {
      // Determine switch type
      if (nodeIdLower.includes('core') || nodeIdLower.includes('spine')) {
        shape = "mxgraph.cisco.switches.layer_3_switch";
      } else {
        shape = "mxgraph.cisco.switches.workgroup_switch";
      }
    }
    // Firewall detection - improved patterns matching GraphML version
    else if (
        nodeIdLower.includes('fw') || 
        nodeIdLower.includes('firewall') ||
        platformLower.includes('firewall') || 
        platformLower.includes('asa') ||
        platformLower.includes('ftd') || 
        platformLower.includes('palo alto')
    ) {
      shape = "mxgraph.cisco.security.firewall";
    }
    // Endpoint detection - improved patterns matching GraphML version
    else if (
        nodeIdLower.includes('pc') || 
        nodeIdLower.includes('host') || 
        nodeIdLower.includes('srv') || 
        nodeIdLower.includes('server') ||
        this.macPattern(nodeIdLower)
    ) {
      // Differentiate between workstation and server
      if (nodeIdLower.includes('srv') || nodeIdLower.includes('server')) {
        shape = "mxgraph.cisco.servers.server";
      } else {
        shape = "mxgraph.cisco.computers_and_peripherals.workstation";
      }
    }
    // Wireless detection - improved patterns matching GraphML version
    else if (
        nodeIdLower.includes('ap') || 
        nodeIdLower.includes('wap') ||
        platformLower.includes('wireless') || 
        platformLower.includes('aironet')
    ) {
      shape = "mxgraph.cisco.wireless.access_point";
    }
    // Phone detection
    else if (
        platformLower.includes('phone') || 
        platformLower.includes('sep') ||
        nodeIdLower.includes('phone')
    ) {
      shape = "mxgraph.cisco.endpoints.ip_phone";
    }
    
    // Return style with shape if found, otherwise just base style
    return shape ? `${baseStyle};shape=${shape};sketch=0` : baseStyle;
  }
  
  // ENHANCED: New method to calculate layout ensuring all nodes are included
  calculateLayoutWithAllNodes(networkData, edges) {
    // Create adjacency list
    const adjacency = {};
    for (const nodeId of Object.keys(networkData)) {
      if (!adjacency[nodeId]) adjacency[nodeId] = [];
    }
    
    for (const [source, target] of edges) {
      if (!adjacency[source]) adjacency[source] = [];
      if (!adjacency[target]) adjacency[target] = [];
      
      adjacency[source].push(target);
      adjacency[target].push(source);
    }
    
    // Find root node (prefer usa1-core-01)
    let rootNode = null;
    for (const nodeId of Object.keys(networkData)) {
      if (nodeId.toLowerCase().includes('usa1-core-01')) {
        rootNode = nodeId;
        break;
      }
    }
    
    // If no specific root found, use node with most connections
    if (!rootNode) {
      let maxConnections = 0;
      for (const [nodeId, connections] of Object.entries(adjacency)) {
        if (connections.length > maxConnections) {
          maxConnections = connections.length;
          rootNode = nodeId;
        }
      }
    }
    
    // Choose layout based on configured type
    let positions;
    if (this.layoutType === 'grid') {
      positions = this.calculateGridLayout(networkData);
    } else if (this.layoutType === 'balloon') {
      positions = this.calculateBalloonLayoutForAll(networkData, adjacency, rootNode);
    } else {
      positions = this.calculateTreeLayoutForAll(networkData, adjacency, rootNode);
    }
    
    // ENHANCED: Ensure all nodes from networkData are included in positions
    const allNodes = Object.keys(networkData);
    const placedNodes = Object.keys(positions);
    
    // Find nodes that weren't placed by the layout algorithm
    const unplacedNodes = allNodes.filter(nodeId => !placedNodes.includes(nodeId));
    
    // If there are unplaced nodes, add them to the layout
    if (unplacedNodes.length > 0) {
      console.log(`Adding ${unplacedNodes.length} disconnected nodes to layout:`);
      
      // Find the maximum X and Y coordinates used so far
      let maxX = 0;
      let maxY = 0;
      for (const [x, y] of Object.values(positions)) {
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      
      // Place disconnected nodes in a separate section below the main diagram
      const sectionsPerRow = 4; // Number of nodes per row
      maxY += this.verticalSpacing * 2; // Add some extra spacing before disconnected section
      
      for (let i = 0; i < unplacedNodes.length; i++) {
        const col = i % sectionsPerRow;
        const row = Math.floor(i / sectionsPerRow);
        
        positions[unplacedNodes[i]] = [
          this.startX + (col * this.horizontalSpacing),
          maxY + (row * this.verticalSpacing)
        ];
        
        console.log(`  - Placed disconnected node: ${unplacedNodes[i]}`);
      }
    }
    
    return positions;
  }
  
  // Enhanced: Simple grid layout that includes all nodes
  calculateGridLayout(networkData) {
    const positions = {};
    const nodes = Object.keys(networkData);
    const cols = Math.ceil(Math.sqrt(nodes.length));
    
    for (let i = 0; i < nodes.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      positions[nodes[i]] = [
        this.startX + (col * this.horizontalSpacing),
        this.startY + (row * this.verticalSpacing)
      ];
    }
    
    return positions;
  }
  
  // ENHANCED: Tree layout that handles disconnected components
  calculateTreeLayoutForAll(networkData, adjacency, rootNode) {
    const positions = {};
    const visited = new Set();
    const levels = {};
    
    // Process connected components first using BFS
    const processConnectedComponent = (startNode) => {
      const componentVisited = new Set();
      const componentLevels = {};
      
      // BFS to build tree levels for this component
      const queue = [[startNode, 0]];
      componentVisited.add(startNode);
      
      while (queue.length > 0) {
        const [node, level] = queue.shift();
        
        if (!componentLevels[level]) {
          componentLevels[level] = [];
        }
        componentLevels[level].push(node);
        
        const neighbors = adjacency[node] || [];
        for (const neighbor of neighbors) {
          if (!componentVisited.has(neighbor)) {
            componentVisited.add(neighbor);
            queue.push([neighbor, level + 1]);
          }
        }
      }
      
      return { visited: componentVisited, levels: componentLevels };
    };
    
    // Process the main component (starting from root node)
    const mainComponent = processConnectedComponent(rootNode);
    
    // Add all nodes from main component to the visited set
    for (const node of mainComponent.visited) {
      visited.add(node);
    }
    
    // Copy the main component's levels
    Object.assign(levels, mainComponent.levels);
    
    // Find and process other disconnected components
    const allNodes = Object.keys(networkData);
    let disconnectedComponentCount = 0;
    
    for (const node of allNodes) {
      if (!visited.has(node)) {
        // Process this new component
        const component = processConnectedComponent(node);
        disconnectedComponentCount++;
        
        // Add all nodes from this component to the visited set
        for (const compNode of component.visited) {
          visited.add(compNode);
        }
        
        // Add this component's levels with an offset
        const baseLevel = Object.keys(levels).length > 0 ? 
          Math.max(...Object.keys(levels).map(Number)) + 2 : 0;
        
        for (const [levelStr, nodes] of Object.entries(component.levels)) {
          const newLevel = Number(levelStr) + baseLevel;
          if (!levels[newLevel]) {
            levels[newLevel] = [];
          }
          levels[newLevel].push(...nodes);
        }
      }
    }
    
    if (disconnectedComponentCount > 0) {
      console.log(`Found ${disconnectedComponentCount} disconnected network components`);
    }
    
    // Position nodes level by level
    for (const [level, nodes] of Object.entries(levels)) {
      const lvl = parseInt(level);
      const y = this.startY + (lvl * this.verticalSpacing);
      
      // Calculate width for this level
      const levelWidth = (nodes.length - 1) * this.horizontalSpacing;
      const startX = this.startX - (levelWidth / 2);
      
      // Position nodes horizontally
      for (let i = 0; i < nodes.length; i++) {
        positions[nodes[i]] = [
          startX + (i * this.horizontalSpacing),
          y
        ];
      }
    }
    
    return positions;
  }
  
  // ENHANCED: Balloon/radial layout that handles disconnected components
  calculateBalloonLayoutForAll(networkData, adjacency, centerNode) {
    const positions = {};
    const visited = new Set();
    
    // Process the main component first
    const processComponent = (startNode, centerX, centerY) => {
      const componentVisited = new Set([startNode]);
      const rings = [];
      let currentRing = [];
      
      // BFS to build concentric rings
      const queue = [[startNode, 0]];
      let currentLevel = 0;
      
      while (queue.length > 0) {
        const [node, level] = queue.shift();
        
        if (level > currentLevel) {
          if (currentRing.length > 0) {
            rings.push([...currentRing]);
            currentRing = [];
          }
          currentLevel = level;
        }
        
        if (level > 0) {
          currentRing.push(node);
        }
        
        const neighbors = adjacency[node] || [];
        for (const neighbor of neighbors.sort()) {
          if (!componentVisited.has(neighbor)) {
            componentVisited.add(neighbor);
            queue.push([neighbor, level + 1]);
          }
        }
      }
      
      if (currentRing.length > 0) {
        rings.push([...currentRing]);
      }
      
      // Position center node
      positions[startNode] = [centerX, centerY];
      
      // Position each ring
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        const radius = 200 + (r * 150);
        
        for (let i = 0; i < ring.length; i++) {
          const angle = (2 * Math.PI * i) / ring.length;
          positions[ring[i]] = [
            centerX + Math.round(radius * Math.cos(angle)),
            centerY + Math.round(radius * Math.sin(angle))
          ];
        }
      }
      
      return componentVisited;
    };
    
    // Process main component
    const mainComponentNodes = processComponent(centerNode, this.startX, this.startY);
    
    // Add all processed nodes to the visited set
    for (const node of mainComponentNodes) {
      visited.add(node);
    }
    
    // Process disconnected components
    const allNodes = Object.keys(networkData);
    let componentCount = 1; // Start at 1 for the main component
    
    for (const node of allNodes) {
      if (!visited.has(node)) {
        // Process this component with offset center
        const offsetX = this.startX + (componentCount * this.horizontalSpacing * 4);
        const offsetY = this.startY;
        
        const componentNodes = processComponent(node, offsetX, offsetY);
        componentCount++;
        
        // Add all processed nodes to the visited set
        for (const compNode of componentNodes) {
          visited.add(compNode);
        }
      }
    }
    
    // Check for any remaining nodes
    const missingNodes = allNodes.filter(node => !visited.has(node));
    
    // Place any remaining nodes in a grid
    if (missingNodes.length > 0) {
      const gridCols = Math.ceil(Math.sqrt(missingNodes.length));
      const gridStartY = this.startY + 800; // Place below main components
      
      for (let i = 0; i < missingNodes.length; i++) {
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;
        
        positions[missingNodes[i]] = [
          this.startX + (col * this.horizontalSpacing),
          gridStartY + (row * this.verticalSpacing)
        ];
      }
    }
    
    return positions;
  }
}

// Process command line arguments and run the converter
function main() {
  const args = process.argv.slice(2);
  
  // Show help message
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Enhanced Network Topology to Draw.io Converter
--------------------------------------------
Converts network_map.json to Draw.io XML format
Uses Draw.io's built-in Cisco network shapes
ENHANCED: Ensures all nodes are visualized regardless of connectivity
ENHANCED: Adds interface name normalization for consistent representation

Usage:
  node enhanced_topology_to_drawio.js <input-file> <output-file> [options]

Options:
  --icons            Use Cisco device icons (recommended)
  --layout <type>    Layout type: grid, tree, balloon (default: tree)
  --help, -h         Show this help message
    `);
    return;
  }
  
  // Get input and output files
  const inputFile = args[0];
  const outputFile = args[1];
  
  if (!inputFile || !outputFile) {
    console.error('Error: Input and output file paths are required');
    console.log('Usage: node enhanced_topology_to_drawio.js <input-file> <output-file> [options]');
    process.exit(1);
  }
  
  // Parse options
  const options = {
    useIcons: args.includes('--icons'),
    layout: 'tree'
  };
  
  // Check for layout type
  const layoutIndex = args.indexOf('--layout');
  if (layoutIndex !== -1 && layoutIndex + 1 < args.length) {
    const layoutType = args[layoutIndex + 1];
    if (['grid', 'tree', 'balloon'].includes(layoutType)) {
      options.layout = layoutType;
    }
  }
  
  try {
    // Read input file
    console.log(`Reading network topology from ${inputFile}...`);
    const networkData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    console.log(`Found ${Object.keys(networkData).length} nodes in input data`);
    
    // Create converter and convert the topology
    const converter = new NetworkDrawioConverter(options);
    converter.convert(networkData, outputFile);
    
    console.log('\nExport Options:');
    console.log(`Layout: ${options.layout}`);
    console.log(`Icons: ${options.useIcons ? 'enabled' : 'disabled'}`);
    console.log(`Interface Normalization: enabled`);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
module.exports = {
  NetworkDrawioConverter,
  main  // Optionally export main as well
};

// Only run main() if this script is executed directly
if (require.main === module) {
  main();
}