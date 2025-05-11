// Store the VS Code API
const vscode = acquireVsCodeApi();

// Variables for diagram manipulation
let currentZoom = 1;

// Initialize mermaid
document.addEventListener('DOMContentLoaded', function() {
    // Initialize mermaid with theme from VS Code
    const isDarkTheme = document.body.classList.contains('vscode-dark');
    
    mermaid.initialize({
        startOnLoad: true,
        theme: isDarkTheme ? 'dark' : 'default',
        securityLevel: 'loose',
        flowchart: {
            curve: 'basis',
            padding: 20,
            nodeSpacing: 50,
            rankSpacing: 100
        },
        themeVariables: {
            primaryColor: '#ff9966',
            primaryTextColor: '#000',
            primaryBorderColor: '#333',
            lineColor: '#666',
            secondaryColor: '#6699ff',
            tertiaryColor: '#66ff99'
        },
        maxTextSize: 100000
    });

    // Log initialization
    logMessage('Mermaid diagram initialized');
    
    // Initial fit to view
    setTimeout(fitToView, 1000);
    
    // Set up zoom button event listeners
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const fitToViewBtn = document.getElementById('fitToViewBtn');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
    if (fitToViewBtn) fitToViewBtn.addEventListener('click', fitToView);
    
    logMessage('Zoom controls initialized');
});

// File operations
function openFile() {
    vscode.postMessage({ command: 'openFile' });
}

function saveFile() {
    vscode.postMessage({ command: 'saveFile' });
}

// Zoom operations
function zoomIn() {
    logMessage('Zoom in');
    currentZoom *= 1.2;
    applyZoom();
}

function zoomOut() {
    logMessage('Zoom out');
    currentZoom *= 0.8;
    applyZoom();
}

function resetZoom() {
    logMessage('Reset zoom');
    currentZoom = 1;
    applyZoom();
}

function applyZoom() {
    const diagram = document.getElementById('mermaidDiagram');
    if (!diagram) {
        logMessage('Error: mermaidDiagram element not found for zooming');
        return;
    }
    
    // Apply zoom transform
    diagram.style.transform = 'scale(' + currentZoom + ')';
    logMessage(`Applied zoom: ${currentZoom.toFixed(2)}x`);
}

function fitToView() {
    logMessage('Fit to view');
    
    // Get diagram and container dimensions
    const diagram = document.getElementById('mermaidDiagram');
    const container = document.getElementById('diagram-container');
    
    if (!diagram || !container) {
        logMessage('Error: Required elements not found for fit to view');
        return;
    }
    
    // Get SVG element inside mermaid div
    const svg = diagram.querySelector('svg');
    if (!svg) {
        logMessage('Error: SVG element not found in diagram');
        return;
    }
    
    // Get dimensions
    const svgWidth = parseFloat(svg.getAttribute('width') || svg.getBoundingClientRect().width);
    const svgHeight = parseFloat(svg.getAttribute('height') || svg.getBoundingClientRect().height);
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    logMessage(`SVG dimensions: ${svgWidth}x${svgHeight}, Container: ${containerWidth}x${containerHeight}`);
    
    // Calculate zoom factor (with some padding)
    const widthRatio = (containerWidth - 40) / svgWidth;
    const heightRatio = (containerHeight - 40) / svgHeight;
    
    // Take the smaller ratio to ensure the entire diagram fits
    currentZoom = Math.min(widthRatio, heightRatio);
    
    // Apply zoom
    applyZoom();
    logMessage('Fitted diagram to view (zoom: ' + currentZoom.toFixed(2) + ')');
}

// Layout operations
function changeLayout(layout) {
    logMessage('Changing layout to ' + layout);
    vscode.postMessage({ command: 'changeLayout', layout: layout });
}

// Node operations
function highlightNode(nodeName) {
    const nodeId = nodeName.replace(/-/g, '_');
    logMessage('Highlighting node: ' + nodeName);
    
    // Highlight in the list
    document.querySelectorAll('.node-item').forEach(item => {
        if (item.textContent === nodeName) {
            item.classList.add('selected');
            item.style.color = 'rgb(188, 39, 190)'; // Purple color
            item.style.fontWeight = 'bold';
        } else {
            item.classList.remove('selected');
            item.style.color = '';
            item.style.fontWeight = '';
        }
    });
    
    // Wait for the diagram to be rendered
    setTimeout(() => {
        try {
            // Reset all nodes first - remove any previous highlights
            document.querySelectorAll('g.node rect, g.node polygon').forEach(shape => {
                shape.removeAttribute('style');
                shape.setAttribute('fill', '');
                shape.setAttribute('stroke', '');
                shape.setAttribute('stroke-width', '');
            });
            
            // Simplified selection approach similar to Python implementation
            document.querySelectorAll('g.node').forEach(node => {
                // Use textContent check on the whole node element
                const text = node.textContent || '';
                
                if (text.includes(nodeName)) {
                    logMessage('Found node: ' + nodeName);
                    
                    // Find the shape element (rect or polygon)
                    const shape = node.querySelector('rect') || node.querySelector('polygon');
                    
                    if (shape) {
                        // Apply direct style with !important-like priority
                        shape.style.cssText = `
                            fill: rgb(208, 219, 43) !important; 
                            stroke: #000000 !important;
                            stroke-width: 3px !important;
                        `;
                        
                        // Also set SVG attributes as a fallback
                        shape.setAttribute('fill', 'rgb(208, 219, 43)');
                        shape.setAttribute('stroke', '#000000');
                        shape.setAttribute('stroke-width', '3');
                        
                        // Add a custom data attribute to mark this as highlighted
                        node.setAttribute('data-highlighted', 'true');
                        
                        // Scroll to the node
                        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                } else {
                    // Ensure node is not highlighted
                    node.removeAttribute('data-highlighted');
                }
            });
            
            // If nothing was found using the above method, try the alternative selector
            // for newer Mermaid versions
            const highlightedNodes = document.querySelectorAll('[data-highlighted="true"]');
            if (highlightedNodes.length === 0) {
                logMessage('Trying alternative node selection method');
                
                // Try CSS selector that looks for node text content
                const allNodeTexts = document.querySelectorAll('.nodeText, .nodeLabel');
                
                allNodeTexts.forEach(textElement => {
                    if (textElement.textContent.includes(nodeName)) {
                        // Go up to find the node container
                        let currentNode = textElement;
                        while (currentNode && !currentNode.classList.contains('node')) {
                            currentNode = currentNode.parentElement;
                        }
                        
                        if (currentNode) {
                            const node = currentNode;
                            logMessage('Found node using alternative method: ' + nodeName);
                            
                            // Find shape elements
                            const shape = node.querySelector('rect') || 
                                          node.querySelector('polygon') || 
                                          node.querySelector('circle');
                            
                            if (shape) {
                                // Apply direct style with !important-like priority
                                shape.style.cssText = `
                                    fill: rgb(208, 219, 43) !important; 
                                    stroke: #000000 !important;
                                    stroke-width: 3px !important;
                                `;
                                
                                // Set attributes as fallback
                                shape.setAttribute('fill', 'rgb(208, 219, 43)');
                                shape.setAttribute('stroke', '#000000');
                                shape.setAttribute('stroke-width', '3');
                                
                                // Mark as highlighted
                                node.setAttribute('data-highlighted', 'true');
                                
                                // Scroll
                                node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    }
                });
            }
            
            // Debug information
            const highlighted = document.querySelectorAll('[data-highlighted="true"]').length;
            logMessage(`Highlighting complete. Found ${highlighted} nodes matching.`);
            
        } catch (e) {
            logMessage('Error highlighting node: ' + e.message);
        }
    }, 1000); // Longer delay to ensure diagram is fully rendered
}

// Logging
function logMessage(message) {
    const logWindow = document.getElementById('log-window');
    if (!logWindow) return;
    
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    logWindow.innerHTML += `<div>${timestamp}: ${message}</div>`;
    logWindow.scrollTop = logWindow.scrollHeight;
}

// Handle wheel zoom
document.addEventListener('DOMContentLoaded', function() {
    // Initialize wheel zoom on the diagram container
    const container = document.querySelector('.diagram-container');
    if (container) {
        container.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                if (e.deltaY < 0) {
                    zoomIn();
                } else {
                    zoomOut();
                }
            }
        }, { passive: false });
        logMessage('Wheel zoom initialized');
    } else {
        setTimeout(() => {
            const lateContainer = document.querySelector('.diagram-container');
            if (lateContainer) {
                lateContainer.addEventListener('wheel', (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.deltaY < 0) {
                            zoomIn();
                        } else {
                            zoomOut();
                        }
                    }
                }, { passive: false });
                logMessage('Wheel zoom initialized (delayed)');
            } else {
                logMessage('Error: Could not find diagram container for wheel zoom');
            }
        }, 2000);
    }
    
    // Initialize click handlers for buttons if they use onclick attributes
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.resetZoom = resetZoom;
    window.fitToView = fitToView;
});

// Add CSS for highlighting with important priority
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        g.node[data-highlighted="true"] rect,
        g.node[data-highlighted="true"] polygon,
        g.node[data-highlighted="true"] circle {
            fill: rgb(208, 219, 43) !important;
            stroke: #000000 !important;
            stroke-width: 3px !important;
        }
        
        .node-item.selected {
            background-color: #3b3b3b !important;
            color: rgb(188, 39, 190) !important;
            font-weight: bold !important;
        }
    `;
    document.head.appendChild(style);
});

// Handle messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateDiagram':
            logMessage('Updating diagram...');
            const diagramContainer = document.getElementById('diagram-container');
            diagramContainer.innerHTML = '<div class="mermaid" id="mermaidDiagram">' + message.mermaidCode + '</div>';
            
            // Reinitialize mermaid
            try {
                mermaid.init(undefined, document.querySelector('.mermaid'));
                logMessage('Diagram updated');
            } catch (e) {
                logMessage('Error initializing diagram: ' + e.message);
            }
            
            // Update node list
            if (message.nodeList) {
                updateNodeList(message.nodeList);
            }
            
            // Fit to view after rendering
            setTimeout(fitToView, 500);
            break;
            
        case 'updateNodeList':
            updateNodeList(message.nodeList);
            break;
    }
});

// Update the node list in the legend panel
function updateNodeList(nodeList) {
    const nodeListElement = document.getElementById('node-list');
    if (!nodeListElement) {
        logMessage('Error: Node list element not found');
        return;
    }
    
    nodeListElement.innerHTML = '';
    
    if (nodeList && nodeList.length > 0) {
        nodeList.forEach(node => {
            const li = document.createElement('li');
            li.className = 'node-item';
            li.textContent = node;
            li.onclick = function() { highlightNode(node); };
            nodeListElement.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.className = 'node-item';
        li.textContent = 'No nodes found';
        nodeListElement.appendChild(li);
    }
}