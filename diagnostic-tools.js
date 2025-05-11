/**
 * Diagnostic tools for Network Mapper Extension
 * 
 * This file contains functions to help diagnose issues with the extension
 * Place it in the root directory of your extension
 */

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

/**
 * Tests the ability to load required modules
 * @returns {Object} Status of module loading
 */
function testModuleLoading() {
    const results = {
        status: 'unknown',
        modules: {},
        errors: []
    };

    try {
        // Test loading the main modules
        try {
            results.modules.crawl4 = require('./lib/crawl4');
            results.modules.crawl4Status = 'loaded';
            
            // Check for expected exports
            if (results.modules.crawl4.NetworkDiscovery) {
                results.modules.crawl4NetworkDiscovery = 'present';
            } else {
                results.modules.crawl4NetworkDiscovery = 'missing';
                results.errors.push('crawl4.js does not export NetworkDiscovery');
            }
            
            if (results.modules.crawl4.Credential) {
                results.modules.crawl4Credential = 'present';
            } else {
                results.modules.crawl4Credential = 'missing';
                results.errors.push('crawl4.js does not export Credential');
            }
            
            if (results.modules.crawl4.ParseMethod) {
                results.modules.crawl4ParseMethod = 'present';
            } else {
                results.modules.crawl4ParseMethod = 'missing';
                results.errors.push('crawl4.js does not export ParseMethod');
            }
        } catch (err) {
            results.modules.crawl4 = 'error';
            results.modules.crawl4Error = err.message;
            results.errors.push(`Error loading crawl4.js: ${err.message}`);
        }
        
        try {
            results.modules.sshClient = require('./lib/ssh-client2-cisco');
            results.modules.sshClientStatus = 'loaded';
            
            // Check for expected exports
            if (results.modules.sshClient.SynchronousSSHClient) {
                results.modules.sshClientSynchronousSSHClient = 'present';
            } else {
                results.modules.sshClientSynchronousSSHClient = 'missing';
                results.errors.push('ssh-client2-cisco.js does not export SynchronousSSHClient');
            }
            
            if (results.modules.sshClient.SSHClientOptions) {
                results.modules.sshClientSSHClientOptions = 'present';
            } else {
                results.modules.sshClientSSHClientOptions = 'missing';
                results.errors.push('ssh-client2-cisco.js does not export SSHClientOptions');
            }
        } catch (err) {
            results.modules.sshClient = 'error';
            results.modules.sshClientError = err.message;
            results.errors.push(`Error loading ssh-client2-cisco.js: ${err.message}`);
        }
        
        try {
            results.modules.tfsm = require('./lib/tfsm');
            results.modules.tfsmStatus = 'loaded';
            
            // Check for expected exports
            if (results.modules.tfsm.TextFSM) {
                results.modules.tfsmTextFSM = 'present';
            } else {
                results.modules.tfsmTextFSM = 'missing';
                results.errors.push('tfsm.js does not export TextFSM');
            }
        } catch (err) {
            results.modules.tfsm = 'error';
            results.modules.tfsmError = err.message;
            results.errors.push(`Error loading tfsm.js: ${err.message}`);
        }
        
        // Test npm dependencies
        try {
            results.modules.ssh2 = require('ssh2');
            results.modules.ssh2Status = 'loaded';
        } catch (err) {
            results.modules.ssh2 = 'error';
            results.modules.ssh2Error = err.message;
            results.errors.push(`Error loading ssh2 module: ${err.message}`);
        }
        
        try {
            results.modules.dateFns = require('date-fns');
            results.modules.dateFnsStatus = 'loaded';
        } catch (err) {
            results.modules.dateFns = 'error';
            results.modules.dateFnsError = err.message;
            results.errors.push(`Error loading date-fns module: ${err.message}`);
        }
        
        // Overall status
        if (results.errors.length === 0) {
            results.status = 'success';
        } else {
            results.status = 'error';
        }
    } catch (err) {
        results.status = 'critical-error';
        results.criticalError = err.message;
        results.errors.push(`Critical error during diagnostics: ${err.message}`);
    }

    return results;
}

/**
 * Checks the TextFSM templates directory
 * @returns {Object} Status of template directory
 */
function checkTemplates() {
    const results = {
        status: 'unknown',
        templates: {},
        errors: []
    };

    try {
        // Check env variable
        results.templates.envVariable = process.env.NET_TEXTFSM || 'not set';
        
        // Try to find templates directory
        const possibleDirs = [
            process.env.NET_TEXTFSM,
            path.join(__dirname, 'templates', 'textfsm'),
            path.join(__dirname, 'textfsm')
        ];
        
        let templatesFound = false;
        
        for (const dir of possibleDirs) {
            if (!dir) continue;
            
            try {
                const stats = fs.statSync(dir);
                
                if (stats.isDirectory()) {
                    results.templates.directory = dir;
                    results.templates.exists = true;
                    
                    // List template files
                    const files = fs.readdirSync(dir);
                    results.templates.files = files;
                    results.templates.count = files.length;
                    
                    templatesFound = true;
                    break;
                }
            } catch (err) {
                // Continue to next directory
            }
        }
        
        if (!templatesFound) {
            results.templates.exists = false;
            results.errors.push('TextFSM templates directory not found');
        }
        
        // Overall status
        if (results.errors.length === 0) {
            results.status = 'success';
        } else {
            results.status = 'error';
        }
    } catch (err) {
        results.status = 'critical-error';
        results.criticalError = err.message;
        results.errors.push(`Critical error checking templates: ${err.message}`);
    }

    return results;
}

/**
 * Check file system structure
 * @returns {Object} Status of file system structure
 */
function checkFileSystem() {
    const results = {
        status: 'unknown',
        directories: {},
        files: {},
        errors: []
    };

    try {
        // Check main directories
        const dirs = ['lib', 'webview', 'templates', 'templates/textfsm'];
        
        for (const dir of dirs) {
            try {
                const stats = fs.statSync(path.join(__dirname, dir));
                results.directories[dir] = stats.isDirectory() ? 'exists' : 'not-directory';
            } catch (err) {
                results.directories[dir] = 'missing';
                results.errors.push(`Directory '${dir}' not found: ${err.message}`);
            }
        }
        
        // Check main files
        const files = [
            'extension.js',
            'package.json',
            'lib/crawl4.js',
            'lib/ssh-client2-cisco.js',
            'lib/tfsm.js',
            'webview/index.html',
            'webview/main.js',
            'webview/main.css'
        ];
        
        for (const file of files) {
            try {
                const stats = fs.statSync(path.join(__dirname, file));
                results.files[file] = stats.isFile() ? 'exists' : 'not-file';
            } catch (err) {
                results.files[file] = 'missing';
                results.errors.push(`File '${file}' not found: ${err.message}`);
            }
        }
        
        // Check node_modules
        try {
            const stats = fs.statSync(path.join(__dirname, 'node_modules'));
            results.nodeModules = stats.isDirectory() ? 'exists' : 'not-directory';
        } catch (err) {
            results.nodeModules = 'missing';
            results.errors.push(`node_modules directory not found: ${err.message}`);
        }
        
        // Overall status
        if (results.errors.length === 0) {
            results.status = 'success';
        } else {
            results.status = 'error';
        }
    } catch (err) {
        results.status = 'critical-error';
        results.criticalError = err.message;
        results.errors.push(`Critical error checking file system: ${err.message}`);
    }

    return results;
}

/**
 * Run a simple test of NetworkDiscovery class
 * @returns {Object} Status of NetworkDiscovery test
 */
function testNetworkDiscovery() {
    const results = {
        status: 'unknown',
        networkDiscovery: {},
        errors: []
    };

    try {
        // Try to instantiate NetworkDiscovery
        const { NetworkDiscovery, Credential } = require('./lib/crawl4');
        
        // Check if NetworkDiscovery is a constructor
        if (typeof NetworkDiscovery !== 'function') {
            results.networkDiscovery.constructor = 'not-function';
            results.errors.push('NetworkDiscovery is not a constructor');
            results.status = 'error';
            return results;
        }
        
        results.networkDiscovery.constructor = 'function';
        
        // Create test credentials
        const credentials = [
            new Credential({
                username: 'test',
                password: 'test',
                port: 22
            })
        ];
        
        // Create instance
        const discovery = new NetworkDiscovery(credentials, {
            maxThreads: 1,
            outputFile: 'test_output.json',
            exclusions: ''
        });
        
        results.networkDiscovery.instance = 'created';
        
        // Check instance properties
        results.networkDiscovery.properties = {
            credentials: discovery.credentials ? 'present' : 'missing',
            parser: discovery.parser ? 'present' : 'missing',
            discoveredDevices: discovery.discoveredDevices ? 'present' : 'missing',
            discoverSingleThreaded: typeof discovery.discoverSingleThreaded === 'function' ? 'function' : 'missing'
        };
        
        if (!discovery.credentials) {
            results.errors.push('NetworkDiscovery.credentials is missing');
        }
        
        if (!discovery.parser) {
            results.errors.push('NetworkDiscovery.parser is missing');
        }
        
        if (!discovery.discoveredDevices) {
            results.errors.push('NetworkDiscovery.discoveredDevices is missing');
        }
        
        if (typeof discovery.discoverSingleThreaded !== 'function') {
            results.errors.push('NetworkDiscovery.discoverSingleThreaded is not a function');
        }
        
        // Overall status
        if (results.errors.length === 0) {
            results.status = 'success';
        } else {
            results.status = 'error';
        }
    } catch (err) {
        results.status = 'critical-error';
        results.criticalError = err.message;
        results.errors.push(`Critical error testing NetworkDiscovery: ${err.message}`);
    }

    return results;
}

/**
 * Run all diagnostics
 * @returns {Object} All diagnostic results
 */
function runDiagnostics() {
    return {
        moduleLoading: testModuleLoading(),
        templates: checkTemplates(),
        fileSystem: checkFileSystem(),
        networkDiscovery: testNetworkDiscovery(),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
    };
}

// Export the diagnostic tools
module.exports = {
    testModuleLoading,
    checkTemplates,
    checkFileSystem,
    testNetworkDiscovery,
    runDiagnostics
};

// If run directly, print results
if (require.main === module) {
    const results = runDiagnostics();
    console.log(JSON.stringify(results, null, 2));
}