/**
 * crawl4-test-cli.js - Test script for loading crawl4.js components
 * 
 * Run this script with Node.js directly to test if crawl4.js can be loaded properly:
 * node crawl4-test-cli.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Setup environment similar to VS Code extension
global.logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warning: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`)
};

// Path to crawl4.js - adjust this if needed
const crawl4Path = path.join(__dirname, 'lib', 'crawl4.js');
console.log(`Looking for crawl4.js at: ${crawl4Path}`);
console.log(`File exists: ${fs.existsSync(crawl4Path)}`);

if (!fs.existsSync(crawl4Path)) {
  console.error(`Error: crawl4.js not found at ${crawl4Path}`);
  process.exit(1);
}

// Try Method 1: Direct require
console.log('\n=== Method 1: Direct require ===');
try {
  const crawl4 = require(crawl4Path);
  console.log('Module loaded via require');
  console.log('Exports:', Object.keys(crawl4).join(', '));
  
  // Check for the classes
  console.log('NetworkDiscovery:', typeof crawl4.NetworkDiscovery);
  console.log('Credential:', typeof crawl4.Credential);
  console.log('ParseMethod:', typeof crawl4.ParseMethod);
  
  // If we have NetworkDiscovery, test creating an instance
  if (typeof crawl4.NetworkDiscovery === 'function') {
    console.log('\nTesting NetworkDiscovery constructor');
    const credentials = [];
    if (typeof crawl4.Credential === 'function') {
      credentials.push(new crawl4.Credential({
        username: 'test',
        password: 'test',
        port: 22
      }));
      console.log('Created a Credential instance');
    } else {
      credentials.push({
        username: 'test',
        password: 'test',
        port: 22
      });
      console.log('Using plain object for credentials');
    }
    
    try {
      const discovery = new crawl4.NetworkDiscovery(credentials, {
        maxThreads: 1,
        outputFile: 'test_topology.json'
      });
      console.log('Successfully created NetworkDiscovery instance');
      
      if (discovery.parser) {
        console.log('NetworkDiscovery has parser property');
      }
      
      console.log('Methods:', Object.getOwnPropertyNames(crawl4.NetworkDiscovery.prototype).join(', '));
    } catch (err) {
      console.error('Error creating NetworkDiscovery instance:', err.message);
    }
  }
} catch (error) {
  console.error('Error with direct require:', error.message);
  console.error('Stack trace:', error.stack);
}

// Try Method 2: VM module to capture classes defined in global scope
console.log('\n=== Method 2: VM module execution ===');
try {
  // Read the file content
  const fileContent = fs.readFileSync(crawl4Path, 'utf8');
  
  // Create a sandbox with all necessary globals
  const sandbox = {
    require,
    console,
    process,
    __dirname: path.dirname(crawl4Path),
    __filename: crawl4Path,
    module: { exports: {} },
    exports: {},
    global,
    logger: global.logger,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    // Save classes defined in the script
    captureClasses: function() {
      return {
        NetworkDiscovery: global.NetworkDiscovery,
        Credential: global.Credential,
        ParseMethod: global.ParseMethod,
        DiscoveredDevice: global.DiscoveredDevice,
        ExtensibleParser: global.ExtensibleParser
      };
    }
  };
  
  // Create a vm context and run the script
  const context = vm.createContext(sandbox);
  vm.runInContext(fileContent + '\n;this.classes = this.captureClasses();', context, { filename: crawl4Path });
  
  console.log('Script executed in VM');
  console.log('Module exports:', Object.keys(sandbox.module.exports).join(', '));
  
  if (sandbox.classes) {
    console.log('\nCaptured classes from global scope:');
    for (const [name, cls] of Object.entries(sandbox.classes)) {
      console.log(`- ${name}: ${typeof cls}`);
    }
    
    // Test NetworkDiscovery if available
    if (typeof sandbox.classes.NetworkDiscovery === 'function') {
      console.log('\nTesting NetworkDiscovery from VM');
      const Credential = sandbox.classes.Credential;
      const NetworkDiscovery = sandbox.classes.NetworkDiscovery;
      
      const credentials = [];
      if (typeof Credential === 'function') {
        credentials.push(new Credential({
          username: 'test',
          password: 'test',
          port: 22
        }));
        console.log('Created a Credential instance');
      } else {
        credentials.push({
          username: 'test',
          password: 'test',
          port: 22
        });
        console.log('Using plain object for credentials');
      }
      
      try {
        const discovery = new NetworkDiscovery(credentials, {
          maxThreads: 1,
          outputFile: 'test_topology.json'
        });
        console.log('Successfully created NetworkDiscovery instance');
        
        if (discovery.parser) {
          console.log('NetworkDiscovery has parser property');
        }
        
        console.log('Methods:', Object.getOwnPropertyNames(NetworkDiscovery.prototype).join(', '));
      } catch (err) {
        console.error('Error creating NetworkDiscovery instance:', err.message);
      }
    }
  }
} catch (error) {
  console.error('Error with VM execution:', error.message);
  console.error('Stack trace:', error.stack);
}

// Try Method 3: Write a wrapper that evaluates crawl4.js
console.log('\n=== Method 3: Custom wrapper ===');
try {
  // Create a temporary wrapper file
  const wrapperPath = path.join(os.tmpdir(), 'crawl4-wrapper-test.js');
  
  // Write a wrapper that exports the classes
  const wrapperContent = `
  // Define global logger
  global.logger = {
    debug: (msg) => console.log(\`[DEBUG] \${msg}\`),
    info: (msg) => console.log(\`[INFO] \${msg}\`),
    warning: (msg) => console.log(\`[WARN] \${msg}\`),
    error: (msg) => console.log(\`[ERROR] \${msg}\`)
  };
  
  // Execute the original file
  const crawl4 = require('${crawl4Path.replace(/\\/g, '\\\\')}');
  
  // Export both from module.exports and from global
  module.exports = {
    // Try module exports first
    NetworkDiscovery: crawl4.NetworkDiscovery || global.NetworkDiscovery,
    Credential: crawl4.Credential || global.Credential,
    ParseMethod: crawl4.ParseMethod || global.ParseMethod,
    DiscoveredDevice: crawl4.DiscoveredDevice || global.DiscoveredDevice,
    ExtensibleParser: crawl4.ExtensibleParser || global.ExtensibleParser
  };
  `;
  
  fs.writeFileSync(wrapperPath, wrapperContent);
  console.log(`Created temporary wrapper at: ${wrapperPath}`);
  
  // Load the wrapper
  const wrapper = require(wrapperPath);
  console.log('Loaded wrapper module');
  console.log('Exports:', Object.keys(wrapper).join(', '));
  
  // Check for the classes
  console.log('NetworkDiscovery:', typeof wrapper.NetworkDiscovery);
  console.log('Credential:', typeof wrapper.Credential);
  console.log('ParseMethod:', typeof wrapper.ParseMethod);
  
  // Test NetworkDiscovery if available
  if (typeof wrapper.NetworkDiscovery === 'function') {
    console.log('\nTesting NetworkDiscovery from wrapper');
    const credentials = [];
    if (typeof wrapper.Credential === 'function') {
      credentials.push(new wrapper.Credential({
        username: 'test',
        password: 'test',
        port: 22
      }));
      console.log('Created a Credential instance');
    } else {
      credentials.push({
        username: 'test',
        password: 'test',
        port: 22
      });
      console.log('Using plain object for credentials');
    }
    
    try {
      const discovery = new wrapper.NetworkDiscovery(credentials, {
        maxThreads: 1,
        outputFile: 'test_topology.json'
      });
      console.log('Successfully created NetworkDiscovery instance');
      
      if (discovery.parser) {
        console.log('NetworkDiscovery has parser property');
      }
      
      console.log('Methods:', Object.getOwnPropertyNames(wrapper.NetworkDiscovery.prototype).join(', '));
    } catch (err) {
      console.error('Error creating NetworkDiscovery instance:', err.message);
    }
  }
  
  // Clean up
  fs.unlinkSync(wrapperPath);
} catch (error) {
  console.error('Error with custom wrapper:', error.message);
  console.error('Stack trace:', error.stack);
}

// Try Method 4: Check if main() is exported
console.log('\n=== Method 4: Check for main function ===');
try {
  const crawl4 = require(crawl4Path);
  
  if (typeof crawl4.main === 'function') {
    console.log('main() function is exported');
    console.log('Could try running main() directly');
  } else {
    console.log('main() function is not exported');
    
    // Look for main in global scope
    if (typeof global.main === 'function') {
      console.log('main() found in global scope');
    } else {
      console.log('main() not found in global scope');
    }
  }
} catch (error) {
  console.error('Error checking for main():', error.message);
}

console.log('\n=== Test Complete ===');