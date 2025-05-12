#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Check for command line arguments
if (process.argv.length < 4) {
  console.error('Usage: node topology-mapper.js <input-file.json> <output-file.json>');
  process.exit(1);
}

const inputFile = process.argv[2];
const outputFile = process.argv[3];

// Validate input file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file '${inputFile}' does not exist`);
  process.exit(1);
}

try {
  // Read and parse the input JSON file
  const rawData = fs.readFileSync(inputFile, 'utf8');
  const inputData = JSON.parse(rawData);
  console.log(`Read input file: ${inputFile}`);
  
  // Determine file format (graph or topology)
  const isGraphFormat = inputData.nodes && inputData.links;
  const isTopologyFormat = inputData.devices;
  
  let mappedData;
  
  if (isGraphFormat) {
    console.log('Detected graph format, transforming to mapping format...');
    mappedData = transformGraphData(inputData);
  } else if (isTopologyFormat) {
    console.log('Detected topology format, transforming to mapping format...');
    mappedData = transformTopologyData(inputData);
  } else {
    throw new Error('Unrecognized input file format. Expected either graph format with nodes/links or topology format with devices.');
  }
  
  // Write the output JSON file
  fs.writeFileSync(outputFile, JSON.stringify(mappedData, null, 2));
  console.log(`Successfully wrote mapped topology to: ${outputFile}`);
  
} catch (error) {
  console.error('Error processing files:', error.message);
  process.exit(1);
}

/**
 * Transform graph-formatted network topology data to the mapping format
 * @param {Object} data - The input graph data with nodes and links
 * @returns {Object} - The transformed data in mapping format
 */
function transformGraphData(data) {
  const result = {};
  const { nodes, links } = data;
  
  if (!nodes || !links || !Array.isArray(nodes) || !Array.isArray(links)) {
    throw new Error('Invalid graph data format. Expected nodes and links arrays.');
  }
  
  // Create a dictionary for quick node lookup
  const nodeMap = {};
  nodes.forEach(node => {
    nodeMap[node.id] = node;
  });
  
  // Process each node as a device
  nodes.forEach(node => {
    // Skip nodes without a label (hostname)
    if (!node.label) return;
    
    // Use label as the key (without domain if present)
    const deviceKey = node.label.split('.')[0];
    
    // Create entry for this device
    result[deviceKey] = {
      node_details: {
        ip: node.id,
        platform: node.platform || ""
      },
      peers: {}
    };
    
    // Find all links for this node
    const nodeLinks = links.filter(link => 
      link.source === node.id || link.target === node.id
    );
    
    // Process each link to identify peers
    nodeLinks.forEach(link => {
      const peerId = link.source === node.id ? link.target : link.source;
      const peerNode = nodeMap[peerId];
      
      if (!peerNode || !peerNode.label) return;
      
      const peerKey = peerNode.label.split('.')[0];
      
      // Skip if peer is already processed
      if (result[deviceKey].peers[peerKey]) return;
      
      // Get interface connections
      const connections = [];
      
      // Check node interfaces for connections to this peer
      if (node.interfaces) {
        node.interfaces.forEach(intf => {
          if (intf.connectedTo === peerId) {
            connections.push([intf.name, intf.remoteInterface || ""]);
          }
        });
      }
      
      // Also check link for interface information
      if (link.sourceInterface && link.targetInterface) {
        const sourceIsThisNode = link.source === node.id;
        const localInterface = sourceIsThisNode ? link.sourceInterface : link.targetInterface;
        const remoteInterface = sourceIsThisNode ? link.targetInterface : link.sourceInterface;
        
        // Only add if this specific connection is not already included
        const alreadyExists = connections.some(([local, remote]) => 
          local === localInterface && remote === remoteInterface
        );
        
        if (!alreadyExists) {
          connections.push([localInterface, remoteInterface]);
        }
      }
      
      // Add peer if we found connections
      if (connections.length > 0) {
        result[deviceKey].peers[peerKey] = {
          ip: peerId,
          platform: peerNode.platform || "",
          connections: connections
        };
      }
    });
  });
  
  return result;
}

/**
 * Transform device-based topology data to the mapping format
 * @param {Object} data - The input topology data with devices
 * @returns {Object} - The transformed data in mapping format
 */
function transformTopologyData(data) {
  const result = {};
  const devices = data.devices;
  
  // Function to extract interface connections between devices
  function getInterfaceConnections(device1, device2) {
    const connections = [];
    
    // Check if device1 has interfaces connected to device2
    if (device1.interfaces) {
      device1.interfaces.forEach(intf => {
        if (intf.connectedTo === device2.ipAddress) {
          // Find the matching interface on device2
          const matchingInterface = device2.interfaces?.find(
            i => i.connectedTo === device1.ipAddress && i.name === intf.remoteInterface
          );
          
          if (matchingInterface) {
            connections.push([intf.name, matchingInterface.name]);
          } else if (intf.remoteInterface) {
            // Use the remoteInterface name if available
            connections.push([intf.name, intf.remoteInterface]);
          }
        }
      });
    }
    
    return connections;
  }
  
  // Process each device
  Object.values(devices).forEach(device => {
    // Skip devices without a hostname
    if (!device.hostname) return;
    
    // Use hostname as the key (without domain if present)
    const deviceKey = device.hostname.split('.')[0];
    
    // Create entry for this device if it doesn't exist
    if (!result[deviceKey]) {
      result[deviceKey] = {
        node_details: {
          ip: device.ipAddress,
          platform: device.platform || ""
        },
        peers: {}
      };
    }
    
    // Process each neighbor as a potential peer
    if (device.neighbors) {
      device.neighbors.forEach(neighbor => {
        // Skip neighbors without a name
        if (!neighbor.NEIGHBOR_NAME) return;
        
        // Get neighbor's hostname without domain
        const neighborKey = neighbor.NEIGHBOR_NAME.split('.')[0];
        
        // Skip if this is a duplicate (already processed)
        if (result[deviceKey].peers[neighborKey]) return;
        
        // Find the neighbor device object
        const neighborDevice = Object.values(devices).find(d => 
          d.hostname && d.hostname.split('.')[0] === neighborKey
        );
        
        if (neighborDevice) {
          // Get interface connections between these devices
          const connections = getInterfaceConnections(device, neighborDevice);
          
          // Add peer if we found connections
          if (connections.length > 0) {
            result[deviceKey].peers[neighborKey] = {
              ip: neighbor.MGMT_ADDRESS || "",
              platform: neighbor.PLATFORM || "",
              connections: connections
            };
          }
        } else {
          // Handle external devices that don't have a full device entry
          // This might be a device discovered via CDP/LLDP but not directly managed
          result[deviceKey].peers[neighborKey] = {
            ip: neighbor.MGMT_ADDRESS || "",
            platform: neighbor.PLATFORM || "",
            connections: [
              [
                neighbor.LOCAL_INTERFACE || "",
                neighbor.NEIGHBOR_INTERFACE || ""
              ]
            ]
          };
        }
      });
    }
    
    // Process interfaces to find additional peers
    if (device.interfaces) {
      device.interfaces.forEach(intf => {
        if (intf.connectedTo) {
          // Find the peer device
          const peerDevice = Object.values(devices).find(d => 
            d.ipAddress === intf.connectedTo
          );
          
          if (peerDevice && peerDevice.hostname) {
            const peerKey = peerDevice.hostname.split('.')[0];
            
            // Skip if peer is already processed
            if (result[deviceKey].peers[peerKey]) return;
            
            // Get all connections between these devices
            const connections = getInterfaceConnections(device, peerDevice);
            
            // Add peer if we found connections
            if (connections.length > 0) {
              result[deviceKey].peers[peerKey] = {
                ip: peerDevice.ipAddress || "",
                platform: peerDevice.platform || "",
                connections: connections
              };
            }
          }
        }
      });
    }
  });
  
  return result;
}
module.exports = {
  transformGraphData,
  transformTopologyData
};
if (require.main === module) {
  main();
}