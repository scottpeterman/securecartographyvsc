#!/usr/bin/env node

/**
 * Enhanced Network Topology to GraphML Converter
 * ------------------------------------------------------
 * Converts network_map.json format to GraphML for use in yEd
 * Includes support for custom icons based on platform_icon_map.json
 * ENHANCED: Ensures all nodes are included regardless of connectivity
 * 
 * Usage:
 *    node enhanced-topology-graphml.js <input-file> <output-file> [options]
 *    
 * Options:
 *    --icons            Use icons for device visualization
 *    --icons-dir <dir>  Directory containing icon files (default: ./icons_lib)
 *    --no-endpoints     Exclude endpoint devices
 *    --layout <type>    Layout type: grid (default), tree, balloon
 */

const fs = require('fs');
const path = require('path');

/**
 * Enhanced LayoutManager Class
 * Responsible for calculating node positions in different layout algorithms
 * Modified to ensure all nodes are included in layouts regardless of connectivity
 */
class LayoutManager {
  constructor(layoutType = "grid") {
    this.layoutType = layoutType;
    this.nodePositions = {};
    this.processedNodes = new Set();
    
    // Layout configuration
    this.startX = 500;
    this.startY = 100;
    this.horizontalSpacing = 200;
    this.verticalSpacing = 150;
  }
  
  // Calculate position based on layout type
  calculatePosition(nodeId, nodeData, topology, idx) {
    // Check if this node's position is already calculated
    if (this.nodePositions[nodeId]) {
      return this.nodePositions[nodeId];
    }
    
    // Calculate position based on selected layout
    if (this.layoutType === "grid") {
      const position = this.gridLayout(idx);
      this.nodePositions[nodeId] = position;
      this.processedNodes.add(nodeId);
      return position;
    } else if (this.layoutType === "directed_tree") {
      return this.enhancedTreeLayout(nodeId, nodeData, topology, idx);
    } else if (this.layoutType === "balloon") {
      return this.enhancedBalloonLayout(nodeId, nodeData, topology, idx);
    } else {
      const position = this.gridLayout(idx);
      this.nodePositions[nodeId] = position;
      this.processedNodes.add(nodeId);
      return position;
    }
  }
  
  // Basic grid layout with fixed spacing
  gridLayout(idx) {
    const cols = 5; // Adjust columns for better layout
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    return [this.startX + (col * this.horizontalSpacing), this.startY + (row * this.verticalSpacing)];
  }
  
  // ENHANCED: Tree layout that handles disconnected components
  enhancedTreeLayout(nodeId, nodeData, topology, idx) {
    // If position is already calculated, return it
    if (this.nodePositions[nodeId]) {
      return this.nodePositions[nodeId];
    }
    
    // Create adjacency list if not already created
    if (!this.adjacencyList) {
      this.buildAdjacencyList(topology);
    }
    
    // If this node is the first one we're processing,
    // run a comprehensive layout calculation
    if (this.processedNodes.size === 0) {
      this.calculateTreeLayoutForAll(topology);
    }
    
    // At this point, the node should have a position
    if (this.nodePositions[nodeId]) {
      return this.nodePositions[nodeId];
    }
    
    // Fallback: if somehow the node wasn't positioned, use grid layout
    console.warn(`Warning: Node ${nodeId} wasn't positioned in tree layout. Using fallback position.`);
    const position = this.gridLayout(idx);
    this.nodePositions[nodeId] = position;
    this.processedNodes.add(nodeId);
    return position;
  }
  
  // Build adjacency list for the entire topology
  buildAdjacencyList(topology) {
    this.adjacencyList = {};
    
    // Initialize all nodes in the adjacency list
    for (const nodeId of Object.keys(topology)) {
      if (!this.adjacencyList[nodeId]) {
        this.adjacencyList[nodeId] = [];
      }
    }
    
    // Add connections
    for (const [sourceId, sourceData] of Object.entries(topology)) {
      if (sourceData.peers) {
        for (const targetId of Object.keys(sourceData.peers)) {
          // Ensure both nodes are in adjacency list
          if (!this.adjacencyList[sourceId]) {
            this.adjacencyList[sourceId] = [];
          }
          if (!this.adjacencyList[targetId]) {
            this.adjacencyList[targetId] = [];
          }
          
          // Add bidirectional connections
          if (!this.adjacencyList[sourceId].includes(targetId)) {
            this.adjacencyList[sourceId].push(targetId);
          }
          if (!this.adjacencyList[targetId].includes(sourceId)) {
            this.adjacencyList[targetId].push(sourceId);
          }
        }
      }
    }
    
    console.log(`Built adjacency list with ${Object.keys(this.adjacencyList).length} nodes`);
  }
  
  // ENHANCED: Calculate tree layout for all nodes including disconnected components
  calculateTreeLayoutForAll(topology) {
    const allNodeIds = Object.keys(topology);
    
    // Find root nodes for each connected component
    const rootNodes = this.findRootNodes(topology);
    console.log(`Found ${rootNodes.length} root nodes for connected components`);
    
    // Process each connected component
    let componentIndex = 0;
    let maxHeight = 0;
    
    for (const rootNode of rootNodes) {
      // Calculate layout for this component
      const componentLayout = this.calculateComponentTreeLayout(rootNode, topology);
      
      // Apply horizontal offset based on component index
      const horizontalOffset = componentIndex * (this.horizontalSpacing * 4);
      
      // Apply positions with offset
      for (const [nodeId, [x, y]] of Object.entries(componentLayout.positions)) {
        this.nodePositions[nodeId] = [x + horizontalOffset, y];
        this.processedNodes.add(nodeId);
      }
      
      // Track maximum height for next row of components
      maxHeight = Math.max(maxHeight, componentLayout.height);
      
      componentIndex++;
      
      // Start a new row after every 2 components
      if (componentIndex % 3 === 0) {
        this.startY += maxHeight + this.verticalSpacing;
        maxHeight = 0;
        componentIndex = 0;
      }
    }
    
    // Check for any unpositioned nodes
    const unpositionedNodes = allNodeIds.filter(id => !this.processedNodes.has(id));
    
    if (unpositionedNodes.length > 0) {
      console.log(`Positioning ${unpositionedNodes.length} disconnected nodes`);
      
      // Position them in a grid below other components
      const additionalStartY = this.startY + maxHeight + this.verticalSpacing * 2;
      
      for (let i = 0; i < unpositionedNodes.length; i++) {
        const nodeId = unpositionedNodes[i];
        const cols = 5;
        const row = Math.floor(i / cols);
        const col = i % cols;
        
        this.nodePositions[nodeId] = [
          this.startX + (col * this.horizontalSpacing),
          additionalStartY + (row * this.verticalSpacing)
        ];
        this.processedNodes.add(nodeId);
      }
    }
  }
  
  // Find root nodes for all connected components in the topology
  findRootNodes(topology) {
    const visited = new Set();
    const rootNodes = [];
    
    // First, try to find nodes with "core" in the name as preferred roots
    for (const nodeId of Object.keys(topology)) {
      if (nodeId.toLowerCase().includes('core')) {
        rootNodes.push(nodeId);
        
        // Mark this node and all connected nodes as visited
        this.markConnectedNodesAsVisited(nodeId, visited);
      }
    }
    
    // For any remaining unvisited components, find the node with most connections
    for (const nodeId of Object.keys(topology)) {
      if (!visited.has(nodeId)) {
        // Find the best root node for this component
        const componentRoot = this.findBestRootForComponent(nodeId, topology);
        rootNodes.push(componentRoot);
        
        // Mark this component as visited
        this.markConnectedNodesAsVisited(componentRoot, visited);
      }
    }
    
    return rootNodes;
  }
  
  // Mark all nodes in a connected component as visited
  markConnectedNodesAsVisited(startNode, visited) {
    // Use BFS to find all connected nodes
    const queue = [startNode];
    visited.add(startNode);
    
    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.adjacencyList[current] || [];
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  
  // Find the best root node for a component (node with most connections)
  findBestRootForComponent(startNode, topology) {
    // Track nodes in this component
    const componentNodes = new Set();
    const queue = [startNode];
    componentNodes.add(startNode);
    
    // Use BFS to find all nodes in this component
    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.adjacencyList[current] || [];
      
      for (const neighbor of neighbors) {
        if (!componentNodes.has(neighbor)) {
          componentNodes.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    // Find node with most connections
    let bestNode = startNode;
    let maxConnections = this.adjacencyList[startNode]?.length || 0;
    
    for (const nodeId of componentNodes) {
      const connectionCount = this.adjacencyList[nodeId]?.length || 0;
      
      // Prefer nodes with "router" or "core" in the name
      const isSpecialNode = nodeId.toLowerCase().includes('router') || 
                           nodeId.toLowerCase().includes('core') ||
                           nodeId.toLowerCase().includes('rtr');
      
      if ((connectionCount > maxConnections) || 
          (connectionCount === maxConnections && isSpecialNode)) {
        bestNode = nodeId;
        maxConnections = connectionCount;
      }
    }
    
    return bestNode;
  }
  
  // Calculate tree layout for a connected component
  calculateComponentTreeLayout(rootNode, topology) {
    const positions = {};
    const levels = {};
    const visited = new Set();
    
    // BFS to build tree levels
    const queue = [[rootNode, 0]];
    visited.add(rootNode);
    
    while (queue.length > 0) {
      const [node, level] = queue.shift();
      
      if (!levels[level]) {
        levels[level] = [];
      }
      levels[level].push(node);
      
      const neighbors = this.adjacencyList[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, level + 1]);
        }
      }
    }
    
    // Position nodes level by level
    let maxY = 0;
    
    for (const [level, nodes] of Object.entries(levels)) {
      const lvl = parseInt(level);
      const y = this.startY + (lvl * this.verticalSpacing);
      maxY = Math.max(maxY, y);
      
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
    
    return {
      positions: positions,
      height: maxY - this.startY + this.verticalSpacing
    };
  }
  
  // ENHANCED: Balloon layout that handles all nodes including disconnected ones
  enhancedBalloonLayout(nodeId, nodeData, topology, idx) {
    // If position is already calculated, return it
    if (this.nodePositions[nodeId]) {
      return this.nodePositions[nodeId];
    }
    
    // Create adjacency list if not already created
    if (!this.adjacencyList) {
      this.buildAdjacencyList(topology);
    }
    
    // If this node is the first one we're processing,
    // run a comprehensive layout calculation
    if (this.processedNodes.size === 0) {
      this.calculateBalloonLayoutForAll(topology);
    }
    
    // At this point, the node should have a position
    if (this.nodePositions[nodeId]) {
      return this.nodePositions[nodeId];
    }
    
    // Fallback: if somehow the node wasn't positioned, use grid layout
    console.warn(`Warning: Node ${nodeId} wasn't positioned in balloon layout. Using fallback position.`);
    const position = this.gridLayout(idx);
    this.nodePositions[nodeId] = position;
    this.processedNodes.add(nodeId);
    return position;
  }
  
  // Calculate balloon layout for all nodes including disconnected components
  calculateBalloonLayoutForAll(topology) {
    const allNodeIds = Object.keys(topology);
    
    // Find root nodes for each connected component
    const rootNodes = this.findRootNodes(topology);
    console.log(`Found ${rootNodes.length} root nodes for connected components`);
    
    // Process each connected component
    let componentIndex = 0;
    const componentsPerRow = 2;
    
    for (const rootNode of rootNodes) {
      // Calculate position for this component
      const row = Math.floor(componentIndex / componentsPerRow);
      const col = componentIndex % componentsPerRow;
      
      const centerX = this.startX + (col * this.horizontalSpacing * 4);
      const centerY = this.startY + (row * this.verticalSpacing * 6);
      
      // Calculate layout for this component
      this.calculateComponentBalloonLayout(rootNode, centerX, centerY, topology);
      
      componentIndex++;
    }
    
    // Check for any unpositioned nodes
    const unpositionedNodes = allNodeIds.filter(id => !this.processedNodes.has(id));
    
    if (unpositionedNodes.length > 0) {
      console.log(`Positioning ${unpositionedNodes.length} disconnected nodes`);
      
      // Position them in a grid below other components
      const additionalStartY = this.startY + (Math.ceil(rootNodes.length / componentsPerRow) * this.verticalSpacing * 6) + this.verticalSpacing;
      
      for (let i = 0; i < unpositionedNodes.length; i++) {
        const nodeId = unpositionedNodes[i];
        const cols = 5;
        const row = Math.floor(i / cols);
        const col = i % cols;
        
        this.nodePositions[nodeId] = [
          this.startX + (col * this.horizontalSpacing),
          additionalStartY + (row * this.verticalSpacing)
        ];
        this.processedNodes.add(nodeId);
      }
    }
  }
  
  // Calculate balloon layout for a single connected component
  calculateComponentBalloonLayout(rootNode, centerX, centerY, topology) {
    const rings = [];
    const visited = new Set([rootNode]);
    let currentRing = [];
    
    // BFS to build concentric rings
    const queue = [[rootNode, 0]];
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
      
      const neighbors = this.adjacencyList[node] || [];
      for (const neighbor of neighbors.sort()) {
        if (!visited.has(neighbor)) {
          visited.has(neighbor);
          queue.push([neighbor, level + 1]);
          visited.add(neighbor);
        }
      }
    }
    
    if (currentRing.length > 0) {
      rings.push([...currentRing]);
    }
    
    // Position center node
    this.nodePositions[rootNode] = [centerX, centerY];
    this.processedNodes.add(rootNode);
    
    // Position each ring
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const radius = 150 + (r * 100);
      
      for (let i = 0; i < ring.length; i++) {
        const angle = (2 * Math.PI * i) / ring.length;
        const nodeId = ring[i];
        
        this.nodePositions[nodeId] = [
          centerX + Math.round(radius * Math.cos(angle)),
          centerY + Math.round(radius * Math.sin(angle))
        ];
        this.processedNodes.add(nodeId);
      }
    }
  }
  
  // Calculate the level of a node in the hierarchy
  calculateLevel(nodeId, topology) {
    let level = 0;
    let current = nodeId;
    const visited = new Set();
    
    while (current && !visited.has(current)) {
      visited.add(current);
      const parent = this.findParent(current, topology);
      if (parent) {
        level += 1;
        current = parent;
      } else {
        break;
      }
    }
    
    return level;
  }
  
  // Get all nodes at the same level
  getSiblingsAtLevel(nodeId, level, topology) {
    const siblings = [];
    for (const otherId of Object.keys(topology)) {
      if (this.calculateLevel(otherId, topology) === level) {
        siblings.push(otherId);
      }
    }
    return siblings.sort();
  }
  
  // Determine if a node is a root node
  isRootNode(nodeId, topology) {
    return nodeId.toLowerCase().includes('core') || 
      !Object.entries(topology).some(([otherId, otherData]) => {
        return otherId !== nodeId && 
               otherData.peers && 
               otherData.peers[nodeId];
      });
  }
  
  // Find the parent node in the topology
  findParent(nodeId, topology) {
    for (const [parentId, parentData] of Object.entries(topology)) {
      if (parentId !== nodeId && parentData.peers && parentData.peers[nodeId]) {
        return parentId;
      }
    }
    return null;
  }
  
  // Get all child nodes for a given node
  getChildren(nodeId, topology) {
    const children = [];
    if (topology[nodeId] && topology[nodeId].peers) {
      children.push(...Object.keys(topology[nodeId].peers));
    }
    return children;
  }
}

/**
 * IconManager Class
 * Handles loading and mapping of device icons with improved pattern matching
 */
class IconManager {
  constructor(options = {}) {
    this.useIcons = options.useIcons || false;
    this.iconsDir = options.iconsDir || './icons_lib';
    this.mappingFile = options.mappingFile || path.join(this.iconsDir, 'platform_icon_map.json');
    
    this.platformPatterns = {};
    this.defaultIcons = {};
    this.fallbackPatterns = {};
    this.icons = {};
    this.nextIconId = 1;
    
    if (this.useIcons) {
      this.loadIconMapping();
    }
  }
  
  // Load icon mapping configuration from JSON file
  loadIconMapping() {
    try {
      // Check if mapping file exists
      if (!fs.existsSync(this.mappingFile)) {
        console.warn(`Warning: Icon mapping file not found: ${this.mappingFile}`);
        return;
      }
      
      // Parse mapping file
      const iconConfig = JSON.parse(fs.readFileSync(this.mappingFile, 'utf8'));
      
      // Store configuration
      this.platformPatterns = iconConfig.platform_patterns || {};
      this.defaultIcons = iconConfig.defaults || {};
      this.fallbackPatterns = iconConfig.fallback_patterns || {};
      
      // Set base path for icon files
      this.basePath = iconConfig.base_path || this.iconsDir;
      
      // Load icon files
      this.loadIconFiles();
      
      console.log(`Loaded pattern configuration: ${Object.keys(this.platformPatterns).length} platform patterns, ${Object.keys(this.fallbackPatterns).length} fallback categories`);
      
    } catch (error) {
      console.error(`Error loading icon mapping: ${error.message}`);
    }
  }
  
  // Load icon files and convert to base64
  loadIconFiles() {
    try {
      // Get unique icon files from all sources
      const uniqueIcons = new Set([
        ...Object.values(this.platformPatterns),
        ...Object.values(this.defaultIcons)
      ]);
      
      // Check if icon directory exists
      if (!fs.existsSync(this.basePath)) {
        console.warn(`Warning: Icon directory not found: ${this.basePath}`);
        return;
      }
      
      // Load each icon file
      for (const iconFile of uniqueIcons) {
        const iconPath = path.join(this.basePath, iconFile);
        
        // Skip if file doesn't exist
        if (!fs.existsSync(iconPath)) {
          console.warn(`Warning: Icon file not found: ${iconPath}`);
          continue;
        }
        
        // Read file and convert to base64
        const iconData = fs.readFileSync(iconPath);
        const base64Data = iconData.toString('base64');
        
        // Store in icons map
        this.icons[iconFile] = base64Data;
      }
      
      console.log(`Loaded ${Object.keys(this.icons).length} icon files`);
      
    } catch (error) {
      console.error(`Error loading icon files: ${error.message}`);
    }
  }
  
  // Improved pattern matching function
  matchesPattern(text, patterns) {
    if (!text || !patterns || !patterns.length) return false;
    
    // Convert to lowercase for case-insensitive matching
    const textLower = text.toLowerCase();
    
    // Test against each pattern
    return patterns.some(pattern => {
      const patternLower = pattern.toLowerCase();
      
      // Check for exact match
      if (textLower === patternLower) return true;
      
      // Check for substring match
      if (textLower.includes(patternLower)) return true;
      
      // Check for word boundary match (e.g., "switch" should match "core-switch" but not "switchboard")
      const boundaryPattern = new RegExp(`\\b${patternLower}\\b`, 'i');
      if (boundaryPattern.test(textLower)) return true;
      
      return false;
    });
  }
  
  // Get appropriate icon for a device with improved matching
  getNodeIcon(nodeId, platform) {
    if (!this.useIcons || Object.keys(this.icons).length === 0) {
      return [null, null, null];
    }
    
    // Normalize inputs
    const nodeIdLower = (nodeId || '').toLowerCase();
    const platformLower = (platform || '').toLowerCase();
    
    // Debug info (uncomment when needed)
    // console.log(`Finding icon for node: ${nodeId}, platform: ${platform}`);
    
    // Step 1: Try exact platform pattern matches first
    for (const [pattern, iconFile] of Object.entries(this.platformPatterns)) {
      if (platformLower.includes(pattern.toLowerCase()) || nodeIdLower.includes(pattern.toLowerCase())) {
        if (this.icons[iconFile]) {
          // console.log(`Matched platform pattern: ${pattern} -> ${iconFile}`);
          const iconId = this.nextIconId++;
          return [this.icons[iconFile], iconId, iconFile];
        }
      }
    }
    
    // Step 2: Try fallback patterns with improved matching
    for (const [deviceType, fallback] of Object.entries(this.fallbackPatterns)) {
      // Check platform patterns
      const matchesPlatform = this.matchesPattern(platform, fallback.platform_patterns);
      
      // Check name patterns
      const matchesName = this.matchesPattern(nodeId, fallback.name_patterns);
      
      if (matchesPlatform || matchesName) {
        const defaultIcon = this.defaultIcons[fallback.icon];
        if (defaultIcon && this.icons[defaultIcon]) {
          // console.log(`Matched fallback (${deviceType}): ${fallback.icon} -> ${defaultIcon}`);
          const iconId = this.nextIconId++;
          return [this.icons[defaultIcon], iconId, defaultIcon];
        }
      }
    }
    
    // Step 3: Try to intelligently determine device type from name/platform
    let defaultIconType = 'default_unknown';
    
    // Router detection
    if (nodeIdLower.includes('router') || nodeIdLower.includes('rtr') || 
        nodeIdLower.match(/[^a-z]r[0-9]/) || // matches router naming patterns like r1, r2
        platformLower.includes('router') || platformLower.includes('isr') || 
        platformLower.includes('asr') || platformLower.includes('7200') ||
        platformLower.includes('72') || platformLower.includes('cisco ios')) {
      defaultIconType = 'default_router';
    } 
    // Switch detection
    else if (nodeIdLower.includes('switch') || nodeIdLower.includes('sw') ||
             nodeIdLower.includes('core') || nodeIdLower.includes('access') || 
             nodeIdLower.includes('spine') || nodeIdLower.includes('leaf') ||
             nodeIdLower.includes('-sw') || nodeIdLower.includes('_sw') ||
             platformLower.includes('switch') || platformLower.includes('nexus') ||
             platformLower.includes('catalyst') || platformLower.includes('eos') ||
             platformLower.includes('dcs') || platformLower.includes('c9')) {
      defaultIconType = 'default_switch';
    } 
    // Firewall detection
    else if (nodeIdLower.includes('fw') || nodeIdLower.includes('firewall') ||
             platformLower.includes('firewall') || platformLower.includes('asa') ||
             platformLower.includes('ftd') || platformLower.includes('palo alto')) {
      defaultIconType = 'default_firewall';
    }
    // Endpoint detection
    else if (nodeIdLower.includes('pc') || nodeIdLower.includes('host') || 
             nodeIdLower.includes('srv') || nodeIdLower.includes('server') ||
             this.macPattern(nodeIdLower)) {
      defaultIconType = 'default_endpoint';
    }
    // Wireless detection
    else if (nodeIdLower.includes('ap') || nodeIdLower.includes('wap') ||
             platformLower.includes('wireless') || platformLower.includes('aironet')) {
      defaultIconType = 'default_wireless';
    }
    
    // console.log(`Using default icon type: ${defaultIconType}`);
    
    // Use appropriate default icon
    const defaultIcon = this.defaultIcons[defaultIconType];
    if (defaultIcon && this.icons[defaultIcon]) {
      const iconId = this.nextIconId++;
      return [this.icons[defaultIcon], iconId, defaultIcon];
    }
    
    // Absolute fallback - unknown device
    const unknownIcon = this.defaultIcons['default_unknown'];
    if (unknownIcon && this.icons[unknownIcon]) {
      const iconId = this.nextIconId++;
      return [this.icons[unknownIcon], iconId, unknownIcon];
    }
    
    return [null, null, null];
  }
  
  // Check if string is a MAC address
  macPattern(str) {
    return /[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$|[0-9a-f]{4}([.-])[0-9a-f]{4}(\1[0-9a-f]{4})$/.test(str);
  }
}

/**
 * Enhanced NetworkGraphMLExporter Class
 * Converts network map data to GraphML format with improved handling of topology
 */
class NetworkGraphMLExporter {
  constructor(options = {}) {
    // Default configuration
    this.includeEndpoints = options.includeEndpoints !== false;
    this.useIcons = options.useIcons || false;
    this.iconsDir = options.iconsDir || './icons_lib';
    this.layoutType = options.layoutType || 'grid';
    this.fontSize = 12;
    this.fontFamily = "Dialog";
    
    // State tracking
    this.processedEdges = new Set();
    this.processedConnections = new Set();
    this.macPattern = /[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/;
    
    // Create layout manager with enhanced algorithms
    this.layoutManager = new LayoutManager(this.layoutType);
    
    // Create icon manager if icons are enabled
    this.iconManager = new IconManager({
      useIcons: this.useIcons,
      iconsDir: this.iconsDir
    });
    
    // Style configuration
    this.styleConfig = {
      shapeHints: {
        "hexagon": ["core", "lan", "iosv", "eos", "spine", "leaf"],
        "ellipse": ["isr", "asr", "camera"],
        "rectangle": ["switch", "router"]
      },
      colorHints: {
        "core": ["#CCFFFF", "#CCFFFF", false],  // Light blue for core
        "access": ["#FFFFD0", null, false],     // Light yellow for access
        "endpoint": ["#E0FFE0", null, false],   // Light green for endpoints
        "firewall": ["#FFE0E0", null, false],   // Light red for firewalls
        "default": ["#FFFFFF", null, false]     // White for default
      },
      defaultShape: "roundrectangle",
      defaultStyle: ["#FFFFFF", null, false]
    };
  }
  
  // Determine if a node is an endpoint device
  isEndpoint(nodeId, nodeData) {
    // Check if it's a MAC address endpoint
    if (this.macPattern.test(nodeId)) {
      return true;
    }
    
    // Check platform for typical endpoint indicators
    const platform = (nodeData?.node_details?.platform || '').toLowerCase();
    const endpointKeywords = ['endpoint', 'camera', 'wap', 'ap', 'phone', 'printer'];
    
    if (endpointKeywords.some(keyword => platform.includes(keyword))) {
      return true;
    }
    
    // Check if it's only referenced as a peer without its own peers
    if (!nodeData?.peers) {
      return true;
    }
    
    return false;
  }
  
  // Determine node shape and style based on configuration
  getNodeStyle(nodeId, nodeData) {
    const platform = (nodeData?.node_details?.platform || '').toLowerCase();
    
    // Determine shape
    let shape = this.styleConfig.defaultShape;
    for (const [shapeType, patterns] of Object.entries(this.styleConfig.shapeHints)) {
      if (patterns.some(pattern => 
          platform.includes(pattern) || nodeId.toLowerCase().includes(pattern))) {
        shape = shapeType;
        break;
      }
    }
    
    // Determine color style
    let style = this.styleConfig.defaultStyle;
    for (const [styleType, colorStyle] of Object.entries(this.styleConfig.colorHints)) {
      if (platform.includes(styleType) || nodeId.toLowerCase().includes(styleType)) {
        style = colorStyle;
        break;
      }
    }
    
    return [shape, style];
  }
  
  // ENHANCED: Preprocess topology to handle missing nodes
  preprocessTopology(networkData) {
    // Create sets of defined and referenced nodes
    const definedNodes = new Set(Object.keys(networkData));
    const referencedNodes = new Set();
    
    // First pass: Find all referenced nodes
    for (const nodeData of Object.values(networkData)) {
      if (nodeData.peers) {
        Object.keys(nodeData.peers).forEach(peer => referencedNodes.add(peer));
      }
    }
    
    // Find nodes that are referenced but not defined
    const missingNodes = [...referencedNodes].filter(node => !definedNodes.has(node));
    
    // Log information about missing nodes
    if (missingNodes.length > 0) {
      console.log(`Creating definitions for ${missingNodes.length} referenced but undefined nodes:`);
      missingNodes.forEach(nodeId => console.log(`  - ${nodeId}`));
    }
    
    // Create basic definitions for undefined nodes
    const enhancedTopology = {...networkData};
    for (const nodeId of referencedNodes) {
      if (!definedNodes.has(nodeId)) {
        enhancedTopology[nodeId] = {
          node_details: {
            ip: "",
            platform: "Unknown (Referenced)"
          },
          peers: {}
        };
      }
    }
    
    // Second pass: Filter endpoints if needed
    if (!this.includeEndpoints) {
      const filteredTopology = {};
      const endpoints = new Set(
        Object.entries(enhancedTopology)
          .filter(([nodeId, data]) => this.isEndpoint(nodeId, data))
          .map(([nodeId]) => nodeId)
      );
      
      console.log(`Filtering out ${endpoints.size} endpoint devices`);
      
      for (const [nodeId, nodeData] of Object.entries(enhancedTopology)) {
        if (!endpoints.has(nodeId)) {
          const filteredPeers = {};
          
          if (nodeData.peers) {
            for (const [peerId, peerData] of Object.entries(nodeData.peers)) {
              if (!endpoints.has(peerId)) {
                filteredPeers[peerId] = peerData;
              }
            }
          }
          
          filteredTopology[nodeId] = {
            ...nodeData,
            peers: filteredPeers
          };
        }
      }
      
      return filteredTopology;
    }
    
    return enhancedTopology;
  }
  
  // Create a unique key for a connection
  createConnectionKey(source, target, connection) {
    return JSON.stringify(
      [source, target, connection[0], connection[1]].sort()
    );
  }
  
  // Generate GraphML as XML string with proper indentation
  exportToGraphML(networkData) {
    // Preprocess the topology
    const enhancedTopology = this.preprocessTopology(networkData);
    console.log(`Processing ${Object.keys(enhancedTopology).length} nodes for GraphML export`);
    
    // Store icon mappings for resources section
    const iconMappings = {};
    
    // Start building XML structure
    let xmlString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
    xmlString += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" ';
    xmlString += 'xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java" ';
    xmlString += 'xmlns:sys="http://www.yworks.com/xml/yfiles-common/markup/primitives/2.0" ';
    xmlString += 'xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/2.0" ';
    xmlString += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
    xmlString += 'xmlns:y="http://www.yworks.com/xml/graphml" ';
    xmlString += 'xmlns:yed="http://www.yworks.com/xml/yed/3" ';
    xmlString += 'xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">\n';
    
    // Add GraphML keys
    xmlString += this.addKeysXml();
    
    // Start graph
    xmlString += '  <graph id="G" edgedefault="directed">\n';
    
    // Add nodes
    let idx = 0;
    for (const [nodeId, nodeData] of Object.entries(enhancedTopology)) {
      const [nodeXml, iconMapping] = this.addNodeXml(nodeId, nodeData, idx, enhancedTopology);
      xmlString += nodeXml;
      
      // Store icon mapping if one was created
      if (iconMapping) {
        iconMappings[iconMapping.id] = iconMapping.data;
      }
      
      idx++;
    }
    
    // Reset connection tracking before processing edges
    this.processedConnections.clear();
    
    // Add edges
    for (const [sourceId, sourceData] of Object.entries(enhancedTopology)) {
      if (sourceData.peers) {
        for (const [targetId, peerData] of Object.entries(sourceData.peers)) {
          if (peerData.connections && peerData.connections.length > 0) {
            xmlString += this.addEdgesXml(sourceId, targetId, peerData.connections);
          }
        }
      }
    }
    
    // Close graph
    xmlString += '  </graph>\n';
    
    // Add resources section with icons if needed
    if (Object.keys(iconMappings).length > 0) {
      xmlString += this.addResourcesXml(iconMappings);
    }
    
    // Close graphml
    xmlString += '</graphml>';
    
    return xmlString;
  }
  
  // Add resources section with icons - FIXED for yEd compatibility
  addResourcesXml(iconMappings) {
    if (Object.keys(iconMappings).length === 0) {
      return '';
    }
    
    let resourcesXml = '  <data key="d7">\n';
    resourcesXml += '    <y:Resources>\n';
    
    for (const [iconId, iconData] of Object.entries(iconMappings)) {
      // Format exactly as required by yEd on a single line 
      // with &#13; entities for line breaks
      resourcesXml += `      <y:Resource id="${iconId}" type="java.awt.image.BufferedImage" xml:space="preserve">`;
      
      // Split base64 data into chunks with &#13; at the end of each line
      // This is the exact format that yEd requires
      const chunkSize = 76;
      for (let i = 0; i < iconData.length; i += chunkSize) {
        const chunk = iconData.substring(i, i + chunkSize);
        resourcesXml += chunk + '&#13;';
      }
      
      // Close the tag on the same line
      resourcesXml += '</y:Resource>\n';
    }
    
    resourcesXml += '    </y:Resources>\n';
    resourcesXml += '  </data>\n';
    
    return resourcesXml;
  }
  
  // Add GraphML keys as XML
  addKeysXml() {
    const keys = [
      ["graph", "d0", "Description", "string"],
      ["port", "d1", null, null],
      ["port", "d2", null, null],
      ["port", "d3", null, null],
      ["node", "d4", "url", "string"],
      ["node", "d5", "description", "string"],
      ["node", "d6", null, null],
      ["graphml", "d7", null, null],  // Resources
      ["edge", "d8", "url", "string"],
      ["edge", "d9", "description", "string"],
      ["edge", "d10", null, null],
      ["node", "d11", "nmetadata", "string"],
      ["edge", "d12", "emetadata", "string"],
      ["graph", "d13", "gmetadata", "string"]
    ];
    
    const metadataKeys = ["d11", "d12", "d13"];
    
    let keysXml = '';
    
    for (const [target, id, name, attrType] of keys) {
      keysXml += `  <key for="${target}" id="${id}"`;
      
      if (name) {
        keysXml += ` attr.name="${name}"`;
      }
      
      if (attrType) {
        keysXml += ` attr.type="${attrType}"`;
      }
      
      if (["d1", "d2", "d3", "d6", "d10"].includes(id)) {
        const yfilesType = id === "d1" ? "portgraphics" :
                          id === "d2" ? "portgeometry" :
                          id === "d3" ? "portuserdata" :
                          id === "d6" ? "nodegraphics" : "edgegraphics";
        keysXml += ` yfiles.type="${yfilesType}"`;
      } else if (id === "d7") {
        keysXml += ` yfiles.type="resources"`;
      }
      
      if (metadataKeys.includes(id)) {
        keysXml += '>\n    <default></default>\n  </key>\n';
      } else {
        keysXml += '/>\n';
      }
    }
    
    return keysXml;
  }
  
  // Add a node as XML
  addNodeXml(nodeId, nodeData, idx, topology) {
    // Get position from layout manager
    const [x, y] = this.layoutManager.calculatePosition(nodeId, nodeData, topology, idx);
    
    // Node XML
    let nodeXml = `  <node id="${this.escapeXml(nodeId)}">\n`;
    nodeXml += '    <data key="d6">\n';
    
    let iconMapping = null;
    
    // Check if we should use an icon for this node
    if (this.useIcons) {
      const platform = nodeData.node_details.platform || '';
      const [iconData, iconId, iconFile] = this.iconManager.getNodeIcon(nodeId, platform);
      
      if (iconData && iconId) {
        // Use icon node
        nodeXml += this.createImageNodeXml(nodeId, nodeData, x, y, iconId);
        
        // Store icon mapping
        iconMapping = {
          id: iconId,
          data: iconData,
          file: iconFile
        };
      } else {
        // Fall back to shape node
        nodeXml += this.createShapeNodeXml(nodeId, nodeData, x, y);
      }
    } else {
      // Use shape node
      nodeXml += this.createShapeNodeXml(nodeId, nodeData, x, y);
    }
    
    nodeXml += '    </data>\n';
    nodeXml += '  </node>\n';
    
    return [nodeXml, iconMapping];
  }
  
  // Create an image node XML representation
  createImageNodeXml(nodeId, nodeData, x, y, iconId) {
    let xml = '      <y:ImageNode>\n';
    
    // Geometry
    xml += `        <y:Geometry height="60.0" width="60.0" x="${x}" y="${y}"/>\n`;
    
    // Fill
    xml += '        <y:Fill color="#CCCCFF" transparent="false"/>\n';
    
    // Border
    xml += '        <y:BorderStyle color="#000000" type="line" width="1.0"/>\n';
    
    // Label
    const ip = nodeData.node_details.ip || '';
    const platform = nodeData.node_details.platform || '';
    
    xml += '        <y:NodeLabel alignment="center" autoSizePolicy="content" ';
    xml += `fontFamily="${this.fontFamily}" fontSize="${this.fontSize}" fontStyle="plain" `;
    xml += 'hasBackgroundColor="false" hasLineColor="false" ';
    xml += 'horizontalTextPosition="center" iconTextGap="4" ';
    xml += 'modelName="sides" modelPosition="s" textColor="#000000" ';
    xml += 'verticalTextPosition="bottom" visible="true">';
    xml += `${this.escapeXml(nodeId)}\n${this.escapeXml(ip)}\n${this.escapeXml(platform)}</y:NodeLabel>\n`;
    
    // Icon reference
    xml += `        <y:Image refid="${iconId}"/>\n`;
    
    xml += '      </y:ImageNode>\n';
    
    return xml;
  }
  
  // Create a shape node XML representation
  createShapeNodeXml(nodeId, nodeData, x, y) {
    // Get node style
    const [shape, style] = this.getNodeStyle(nodeId, nodeData);
    
    let xml = '      <y:ShapeNode>\n';
    
    // Geometry
    xml += `        <y:Geometry height="60" width="120" x="${x}" y="${y}"/>\n`;
    
    // Fill
    xml += `        <y:Fill color="${style[0]}"`;
    if (style[1]) {
      xml += ` color2="${style[1]}"`;
    }
    xml += ` transparent="${style[2]}"/>\n`;
    
    // Border
    xml += '        <y:BorderStyle color="#000000" type="line" width="1.0"/>\n';
    
    // Shape
    xml += `        <y:Shape type="${shape}"/>\n`;
    
    // Add labels
    const platform = nodeData.node_details.platform || '';
    xml += '        <y:NodeLabel alignment="center" autoSizePolicy="content" ';
    xml += `fontFamily="${this.fontFamily}" fontSize="${this.fontSize}" fontStyle="plain" `;
    xml += 'hasBackgroundColor="false" hasLineColor="false" height="18" ';
    xml += 'horizontalTextPosition="center" iconTextGap="4" modelName="internal" ';
    xml += 'modelPosition="c" textColor="#000000" verticalTextPosition="bottom" ';
    xml += `visible="true" width="70">${this.escapeXml(nodeId)}\n${this.escapeXml(platform)}</y:NodeLabel>\n`;
    
    // Add IP label if available
    const ip = nodeData.node_details.ip;
    if (ip) {
      xml += '        <y:NodeLabel alignment="center" autoSizePolicy="content" ';
      xml += `fontFamily="${this.fontFamily}" fontSize="${this.fontSize}" fontStyle="plain" `;
      xml += 'hasBackgroundColor="false" hasLineColor="false" height="18" ';
      xml += 'horizontalTextPosition="center" iconTextGap="4" modelName="internal" ';
      xml += 'modelPosition="b" textColor="#000000" verticalTextPosition="bottom" ';
      xml += `visible="true" width="70">${this.escapeXml(ip)}</y:NodeLabel>\n`;
    }
    
    xml += '      </y:ShapeNode>\n';
    
    return xml;
  }
  
  // Add edge connections as XML
  addEdgesXml(sourceId, targetId, connections) {
    let edgesXml = '';
    
    for (const [localPort, remotePort] of connections) {
      // Create a unique key for this specific connection
      const connKey = this.createConnectionKey(
        sourceId, 
        targetId, 
        [localPort, remotePort]
      );
      
      if (!this.processedConnections.has(connKey)) {
        // Create edge element
        const edgeId = `e${this.processedConnections.size}`;
        
        edgesXml += `  <edge id="${edgeId}" source="${this.escapeXml(sourceId)}" target="${this.escapeXml(targetId)}">\n`;
        edgesXml += '    <data key="d10">\n';
        edgesXml += '      <y:PolyLineEdge>\n';
        
        // Add line style
        edgesXml += '        <y:LineStyle color="#000000" type="line" width="1.0"/>\n';
        
        // Add arrows
        edgesXml += '        <y:Arrows source="none" target="none"/>\n';
        
        // Add bend style
        edgesXml += '        <y:BendStyle smoothed="false"/>\n';
        
        // Add source port label
        edgesXml += '        <y:EdgeLabel alignment="center" backgroundColor="#FFFFFF" ';
        edgesXml += 'configuration="AutoFlippingLabel" distance="10.0" fontFamily="Dialog" ';
        edgesXml += 'fontSize="12" fontStyle="plain" hasLineColor="false" height="18" ';
        edgesXml += 'modelName="free" modelPosition="anywhere" preferredPlacement="source_on_edge" ';
        edgesXml += 'ratio="0.2" textColor="#000000" visible="true" width="40">';
        edgesXml += `${this.escapeXml(localPort)}</y:EdgeLabel>\n`;
        
        // Add target port label
        edgesXml += '        <y:EdgeLabel alignment="center" backgroundColor="#FFFFFF" ';
        edgesXml += 'configuration="AutoFlippingLabel" distance="10.0" fontFamily="Dialog" ';
        edgesXml += 'fontSize="12" fontStyle="plain" hasLineColor="false" height="18" ';
        edgesXml += 'modelName="free" modelPosition="anywhere" preferredPlacement="target_on_edge" ';
        edgesXml += 'ratio="0.8" textColor="#000000" visible="true" width="40">';
        edgesXml += `${this.escapeXml(remotePort)}</y:EdgeLabel>\n`;
        
        edgesXml += '      </y:PolyLineEdge>\n';
        edgesXml += '    </data>\n';
        edgesXml += '  </edge>\n';
        
        this.processedConnections.add(connKey);
      }
    }
    
    return edgesXml;
  }
  
  // Escape XML special characters
  escapeXml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Process command line arguments and run the converter
 */
function main() {
  const args = process.argv.slice(2);
  
  // Show help if no arguments or help flag
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Enhanced Network Topology to GraphML Converter
-------------------------------------------------------
Converts network_map.json format to GraphML for use in yEd
with support for device icons based on platform_icon_map.json
ENHANCED: Ensures all nodes are visualized regardless of connectivity

Usage:
  node enhanced-topology-graphml.js <input-file> <output-file> [options]

Options:
  --icons            Use icons for device visualization
  --icons-dir <dir>  Directory containing icon files (default: ./icons_lib)
  --no-endpoints     Exclude endpoint devices
  --layout <type>    Layout type: grid (default), tree, balloon
  -h, --help         Show this help message
    `);
    return;
  }
  
  // Get input and output file paths
  const inputFile = args[0];
  const outputFile = args[1];
  
  // Check if input and output files are provided
  if (!inputFile || !outputFile) {
    console.error('Error: Input and output file paths are required');
    process.exit(1);
  }
  
  // Parse options
  const options = {
    includeEndpoints: !args.includes('--no-endpoints'),
    useIcons: args.includes('--icons'),
    iconsDir: './icons_lib',
    layoutType: 'grid'
  };
  
  // Check for icons directory
  const iconsDirIndex = args.indexOf('--icons-dir');
  if (iconsDirIndex !== -1 && iconsDirIndex + 1 < args.length) {
    options.iconsDir = args[iconsDirIndex + 1];
  }
  
  // Check for layout type
  const layoutIndex = args.indexOf('--layout');
  if (layoutIndex !== -1 && layoutIndex + 1 < args.length) {
    const layoutArg = args[layoutIndex + 1];
    const layoutMap = {
      'grid': 'grid',
      'tree': 'directed_tree',
      'balloon': 'balloon'
    };
    
    options.layoutType = layoutMap[layoutArg] || 'grid';
  }
  
  try {
    // Read input file
    console.log(`Reading network topology from ${inputFile}...`);
    const networkData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    console.log(`Found ${Object.keys(networkData).length} nodes in input data`);
    
    // Create exporter
    const exporter = new NetworkGraphMLExporter(options);
    
    // Convert to GraphML
    console.log('Converting to GraphML...');
    const graphML = exporter.exportToGraphML(networkData);
    
    // Write output file
    fs.writeFileSync(outputFile, graphML, 'utf8');
    console.log(`Successfully converted to ${outputFile}`);
    
    // Log options used
    const optionsUsed = [];
    if (options.includeEndpoints) {
      optionsUsed.push('including endpoint devices');
    } else {
      optionsUsed.push('excluding endpoint devices');
    }
    
    if (options.useIcons) {
      optionsUsed.push('using icon representations');
    }
    
    const layoutNames = {
      'grid': 'grid',
      'directed_tree': 'hierarchical tree',
      'balloon': 'balloon/radial'
    };
    
    optionsUsed.push(`using ${layoutNames[options.layoutType]} layout`);
    
    console.log(`Options: ${optionsUsed.join(', ')}`);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
module.exports = {
  LayoutManager,
  IconManager,
  NetworkGraphMLExporter,
  main  // Optionally export main as well
};

// Only run main() if this script is executed directly
if (require.main === module) {
  main();
}