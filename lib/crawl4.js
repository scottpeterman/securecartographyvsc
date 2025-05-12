#!/usr/bin/env node
const net = require('net');
const dns = require('dns');
const { promisify } = require('util');
const { SynchronousSSHClient, SSHClientOptions } = require('./ssh-client2.js');

// Promisify DNS lookup
const dnsLookup = promisify(dns.lookup);

// Function to check if an IP or hostname is reachable
async function isReachable(host, port = 22, timeout = 6000) {
  logger.info(`Checking reachability of ${host}:${port}`);
  
  // Try TCP connection first
  try {
    const result = await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let resolved = false;
      
      // Set up timeout
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ reachable: true, method: 'tcp', host });
        }
      });
      
      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(new Error(`Connection timeout to ${host}:${port}`));
        }
      });
      
      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(err);
        }
      });
      
      socket.connect(port, host);
    });
    
    logger.info(`${host} is reachable via TCP`);
    return result;
  } catch (err) {
    logger.debug(`TCP connection to ${host}:${port} failed: ${err.message}`);
    
    // If hostname is an IP address, try DNS lookup on extracted hostname
    if (net.isIP(host)) {
      logger.info(`${host} is an IP address and not reachable via TCP, skipping DNS lookup`);
      return { reachable: false, method: 'tcp', host, error: err.message };
    }
    
    // Try DNS lookup if TCP failed
    try {
      logger.info(`Attempting DNS lookup for ${host}`);
      const { address } = await dnsLookup(host);
      logger.info(`DNS lookup successful for ${host}: ${address}`);
      return { reachable: true, method: 'dns', host, resolvedIp: address };
    } catch (dnsErr) {
      logger.debug(`DNS lookup failed for ${host}: ${dnsErr.message}`);
      return { reachable: false, method: 'both', host, error: `TCP failed: ${err.message}, DNS failed: ${dnsErr.message}` };
    }
  }
}
// const fs = require('fs');
// const path = require('path');
const { EventEmitter } = require('events');
const TextFSMModule = require('./tfsm.js');
const TextFSM = TextFSMModule.TextFSM;

// Configure logging
const LOG_LEVELS = ['debug', 'info', 'warn', 'error']; // ordered by verbosity
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // change to 'debug' if needed
const currentLevelIndex = LOG_LEVELS.indexOf(CURRENT_LOG_LEVEL);

// Add these lines at the very top of crawl4.js
const os = require('os');
const fs = require('fs');
const path = require('path');

// Create a log directory in the user's home directory
const logDir = path.join(os.homedir(), '.network-mapper-logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    console.error(`Cannot create log directory: ${err.message}`);
  }
}

// Create a log file with timestamp
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const logFile = path.join(logDir, `crawl4-${timestamp}.log`);

// Create a writeLog function that logs to both console and file
function writeLog(level, message) {
  const timestampStr = new Date().toISOString();
  const logEntry = `[${timestampStr}] [${level.toUpperCase()}] ${message}\n`;
  
  // Write to file
  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    console.error(`Error writing to log file: ${err.message}`);
  }
  
  // Also log to console based on level
  switch (level.toLowerCase()) {
    case 'debug':
      console.debug(message);
      break;
    case 'info':
      console.info(message);
      break;
    case 'warn':
    case 'warning':
      console.warn(message);
      break;
    case 'error':
      console.error(message);
      break;
    default:
      console.log(message);
  }
}

// Replace the logger initialization in crawl4.js with this
const logger = {
  debug: (msg) => {
    if (currentLevelIndex <= LOG_LEVELS.indexOf('debug')) {
      writeLog('debug', msg);
    }
  },
  info: (msg) => {
    if (currentLevelIndex <= LOG_LEVELS.indexOf('info')) {
      writeLog('info', msg);
    }
  },
  warning: (msg) => {
    if (currentLevelIndex <= LOG_LEVELS.indexOf('warn')) {
      writeLog('warn', msg);
    }
  },
  error: (msg) => {
    if (currentLevelIndex <= LOG_LEVELS.indexOf('error')) {
      writeLog('error', msg);
    }
  }
};

// Log that we're starting with the file location
writeLog('info', `Network Mapper crawl4.js starting - writing logs to: ${logFile}`);

// Set environment variables for template directories
process.env.NET_TEXTFSM = process.env.NET_TEXTFSM || './templates/textfsm';

class ParseMethod {
  static TEXTFSM = 'TEXTFSM';
  static REGEX = 'REGEX';
}

class Credential {
  constructor(options = {}) {
    this.username = options.username;
    this.password = options.password || null;
    this.keyFile = options.keyFile || null;
    this.keyPassphrase = options.keyPassphrase || null;
    this.port = options.port || 22;
    this.enablePassword = options.enablePassword || null;
    this.authPriority = options.authPriority || 0;
  }
}

class ParseTemplate {
  constructor(method, template, priority = 0, name = '') {
    this.method = method;
    this.template = template;
    this.priority = priority;
    this.name = name || `${method}_${priority}`;
  }
}

class DiscoveredDevice {
  constructor(options = {}) {
    this.hostname = options.hostname;
    this.ipAddress = options.ipAddress;
    this.deviceType = options.deviceType || null;
    this.platform = options.platform || null;
    this.neighbors = options.neighbors || [];
    this.parent = options.parent || null;
    this.visited = options.visited || false;
    this.failed = options.failed || false;
    this.errorMsg = options.errorMsg || null;
    this.rawData = options.rawData || {};
    
    // Additional attributes
    this.serialNumber = options.serialNumber || null;
    this.model = options.model || null;
    this.softwareVersion = options.softwareVersion || null;
    this.macAddress = options.macAddress || null;
    this.managementIp = options.managementIp || null;
    this.interfaces = options.interfaces || [];
    this.discoveredAt = options.discoveredAt || new Date().toISOString();
    this.hopCount = options.hopCount || 0;
    this.successfulCredentials = options.successfulCredentials || null;
    this.reachabilityStatus = options.reachabilityStatus || 'unknown';
    this.lastUpdate = options.lastUpdate || new Date().toISOString();
    
    // Additional fields for better device info
    this.capabilities = options.capabilities || [];
    this.systemDescription = options.systemDescription || null;
    this.localInterfaces = options.localInterfaces || {};
  }
}

class ExtensibleParser {
  constructor() {
    this.templates = [];
  }

  addTemplate(method, template, priority = 0, name = '') {
    this.templates.push(new ParseTemplate(method, template, priority, name));
    // Sort by priority with TextFSM given preference
    this.templates.sort((a, b) => {
      if (a.method === ParseMethod.TEXTFSM && b.method !== ParseMethod.TEXTFSM) return -1;
      if (a.method !== ParseMethod.TEXTFSM && b.method === ParseMethod.TEXTFSM) return 1;
      return a.priority - b.priority;
    });
  }

  parseRegex(text, pattern) {
    const results = [];
    try {
      const regex = new RegExp(pattern, 'gmi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const groups = match.groups || {};
        results.push(groups);
      }
    } catch (e) {
      logger.error(`Regex parsing error: ${e.message}`);
    }
    return results;
  }

  parseTextFSM(text, template) {
    try {
      const cleanedText = this._cleanText(text);
      
      // Debug what TextFSMModule contains
      logger.debug(`TextFSMModule type: ${typeof TextFSMModule}`);
      logger.debug(`TextFSMModule keys: ${Object.keys(TextFSMModule).join(', ')}`);
      
      // Create a direct instance of the TextFSM class from the module
      const fsm = new TextFSMModule.TextFSM(template);
      const result = fsm.parseTextToDicts(cleanedText);
      
      // Clean any remaining control characters from the results
      for (const item of result) {
        for (const key in item) {
          if (typeof item[key] === 'string') {
            item[key] = this._cleanValue(item[key]);
          }
        }
      }
      
      return result;
    } catch (e) {
      logger.error(`TextFSM parsing error: ${e.message}`);
      logger.debug(`Error stack: ${e.stack}`);
      return [];
    }
  }

  _cleanText(text) {
    if (typeof text !== 'string') {
      text = text.toString();
    }
    
    // Convert all line endings to Unix style
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove control characters
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
    
    // Remove ANSI escape sequences
    text = text.replace(/\x1b\[[0-9;]*[mK]/g, '');
    
    return text;
  }

  _cleanValue(value) {
    if (typeof value !== 'string') return value;
    
    // Remove control characters
    value = value.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
    
    // Trim whitespace
    return value.trim();
  }

  
_loadTemplatesFromDirectory(commands, textfsmDir) {
  const templates = [];
  const commandMap = {
    'show cdp neighbors detail': 'cisco_ios_show_cdp_neighbors_detail.textfsm',
    'show lldp neighbors detail': 'cisco_ios_show_lldp_neighbors_detail.textfsm',
    'show lldp neighbor detail': 'arista_eos_show_lldp_neighbors_detail.textfsm'
  };

  // Log all available templates
  try {
    const allTemplates = fs.readdirSync(textfsmDir);
    logger.info(`Available templates in ${textfsmDir}: ${allTemplates.join(', ')}`);
  } catch (e) {
    logger.error(`Error reading template directory: ${e.message}`);
  }

  for (const command of commands) {
    for (const [pattern, templateFile] of Object.entries(commandMap)) {
      if (command.toLowerCase().includes(pattern)) {
        const templatePath = path.join(textfsmDir, templateFile);
        logger.info(`Looking for template: ${templatePath}`);
        
        if (fs.existsSync(templatePath)) {
          try {
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            templates.push(new ParseTemplate(
              ParseMethod.TEXTFSM,
              templateContent,
              0,
              templateFile.replace('.textfsm', '')
            ));
            logger.info(`Loaded TextFSM template: ${templateFile} for command: ${command}`);
          } catch (e) {
            logger.error(`Error loading TextFSM template ${templateFile}: ${e.message}`);
          }
        } else {
          logger.warning(`TextFSM template file not found: ${templatePath}`);
        }
      }
    }
  }

  return templates;
}
loadTextFsmTemplates(commands) {
  // Get textfsmDir with extra logging for debugging
  const textfsmDir = process.env.NET_TEXTFSM;
  logger.info(`Loading TextFSM templates from: ${textfsmDir}`);

  // Check if directory exists with better error messages
  if (!fs.existsSync(textfsmDir)) {
    logger.error(`TextFSM directory does not exist: ${textfsmDir}`);
    logger.info(`Current working directory: ${process.cwd()}`);
    logger.info(`Trying absolute path resolution...`);
    
    // Try as absolute path if it looks like a relative path
    if (!path.isAbsolute(textfsmDir)) {
      const absolutePath = path.resolve(textfsmDir);
      logger.info(`Trying absolute path: ${absolutePath}`);
      if (fs.existsSync(absolutePath)) {
        logger.info(`Found template directory at absolute path: ${absolutePath}`);
        return this._loadTemplatesFromDirectory(commands, absolutePath);
      }
    }
    return [];
  }

  return this._loadTemplatesFromDirectory(commands, textfsmDir);
}
  parse(text) {
    logger.info(`PARSING - Total templates available: ${this.templates.length}`);
    
    const textfsmCount = this.templates.filter(t => t.method === ParseMethod.TEXTFSM).length;
    const regexCount = this.templates.filter(t => t.method === ParseMethod.REGEX).length;
    
    logger.info(`PARSING - Template methods count: TextFSM=${textfsmCount}, REGEX=${regexCount}`);

    for (const template of this.templates) {
      logger.info(`PARSING - Trying template: ${template.name}`);

      try {
        let results;
        
        if (template.method === ParseMethod.TEXTFSM) {
          logger.info(`PARSING - Using TextFSM for template: ${template.name}`);
          if (!template.template) {
            logger.error(`PARSING - TextFSM template ${template.name} is empty!`);
            continue;
          }
          results = this.parseTextFSM(text, template.template);
          logger.info(`PARSING - TextFSM returned ${results ? results.length : 0} results`);
        } else if (template.method === ParseMethod.REGEX) {
          logger.info(`PARSING - Using Regex for template: ${template.name}`);
          results = this.parseRegex(text, template.template);
          logger.info(`PARSING - Regex returned ${results ? results.length : 0} results`);
        } else {
          logger.info(`PARSING - Unknown method for template: ${template.name}`);
          continue;
        }

        if (results && results.length > 0) {
          logger.info(`PARSING - SUCCESS! Template ${template.name} produced results!`);
          return results;
        } else {
          logger.info(`PARSING - Template ${template.name} produced no results`);
        }
      } catch (e) {
        logger.error(`PARSING - Error with template ${template.name}: ${e.message}`);
        logger.error(e.stack);
        continue;
      }
    }

    logger.warning('PARSING - No parsing template produced results');
    return [];
  }
}

class NetworkDiscovery extends EventEmitter {
  
  
  constructor(credentials, options = {}) {
    super();
    this.credentials = credentials.sort((a, b) => a.authPriority - b.authPriority);
    this.discoveredDevices = {};
    this.parser = new ExtensibleParser();
    this.maxThreads = options.maxThreads || 10;
    this.visitedIps = new Set();
    this.failedIps = new Set();
    this.visitedHostnames = new Set();
    
    // Get settings manager if available
    this.settingsManager = options.settingsManager;
    
    // Set template directory from settings with fallbacks
    if (this.settingsManager && typeof this.settingsManager.getSetting === 'function') {
      // Try to get paths from settings manager
      this.templateDir = this.settingsManager.getSetting('userTemplatesDirectory') || 
                         this.settingsManager.getSetting('templatePath') || 
                         options.templateDir || 
                         'templates';
      
      // Ensure NET_TEXTFSM is set to the correct path
      process.env.NET_TEXTFSM = this.settingsManager.getSetting('templatePath') || 
                               process.env.NET_TEXTFSM || 
                               './templates/textfsm';
      
      logger.info(`Using template path from settings: ${process.env.NET_TEXTFSM}`);
    } else {
      // Fallback to provided values or defaults
      this.templateDir = options.templateDir || 'templates';
      process.env.NET_TEXTFSM = process.env.NET_TEXTFSM || './templates/textfsm';
      logger.info(`Using default template path: ${process.env.NET_TEXTFSM}`);
    }

    // Set output file path with settings integration
    if (this.settingsManager && typeof this.settingsManager.getSetting === 'function') {
      const outputDir = this.settingsManager.getSetting('outputDirectory');
      
      if (outputDir && options.outputFile && !path.isAbsolute(options.outputFile)) {
        // If we have an output directory from settings and a relative output file name,
        // combine them to create an absolute path
        this.outputFile = path.join(outputDir, options.outputFile);
        logger.info(`Using output file with settings path: ${this.outputFile}`);
      } else {
        this.outputFile = options.outputFile || 'network_discovery_results.json';
        logger.info(`Using provided output file: ${this.outputFile}`);
      }
    } else {
      this.outputFile = options.outputFile || 'network_discovery_results.json';
      logger.info(`Using default output file: ${this.outputFile}`);
    }

    // Rest of your initialization...
    this.exclusions = options.exclusions ? options.exclusions.split(',').map(s => s.trim()) : [];
    if (this.exclusions.length > 0) {
      logger.info(`Exclusion patterns loaded: ${this.exclusions.join(', ')}`);
    }
    
    // Discovery commands
    this.discoveryCommands = [
      'show cdp neighbors detail',
      'show lldp neighbors detail',
      'show lldp neighbor detail'
    ];

    // Device information commands
    this.deviceInfoCommands = [];

    // Load TextFSM templates
    const textfsmTemplates = this.parser.loadTextFsmTemplates(this.discoveryCommands);
    textfsmTemplates.forEach(template => {
      this.parser.addTemplate(template.method, template.template, template.priority, template.name);
    });

    if (textfsmTemplates.length === 0) {
      logger.warning('No TextFSM templates were loaded during initialization!');
    }

    // Add comprehensive regex templates
    this._addRegexTemplates();
  }

  _addRegexTemplates() {
    // These regex templates are fallbacks/supplements to TextFSM templates
    // They help capture additional data when TextFSM templates miss something
    
    // Hostname extraction patterns (simple fallback)
    this.parser.addTemplate(
      ParseMethod.REGEX,
      'hostname\\s+(?<hostname>\\S+)',
      100,  // Lower priority than TextFSM
      'hostname_from_config'
    );

    // Basic CDP neighbor pattern with interface info
    // this.parser.addTemplate(
    //   ParseMethod.REGEX,
    //   `Device\\s+ID:\\s*(?<device_id>[^\\n]+?)\\s*\\n` +
    //   `[\\s\\S]*?` +
    //   `IP\\s+address:\\s*(?<ip_address>\\d+\\.\\d+\\.\\d+\\.\\d+)` +
    //   `[\\s\\S]*?` +
    //   `Interface:\\s*(?<local_interface>[^,]+),\\s*Port\\s+ID\\s*\\(outgoing\\s+port\\):\\s*(?<remote_interface>[^\\n]+)`,
    //   101,  // Lower priority than TextFSM
    //   'cdp_neighbor_fallback'
    // );

    // LLDP neighbor pattern with interface info
    // this.parser.addTemplate(
    //   ParseMethod.REGEX,
    //   `Local\\s+Intf:\\s*(?<local_interface>[^\\n]+)\\s*\\n` +
    //   `[\\s\\S]*?` +
    //   `Port\\s+id:\\s*(?<remote_interface>[^\\n]+)` +
    //   `[\\s\\S]*?` +
    //   `System\\s+Name:\\s*(?<system_name>[^\\n]+)`,
    //   102,
    //   'lldp_neighbor_interface'
    // );
  }

  _shouldExcludeDevice(hostname) {
    if (!hostname || this.exclusions.length === 0) {
      return false;
    }
    
    const hostnameUpper = hostname.toUpperCase();
    for (const exclusion of this.exclusions) {
      if (hostnameUpper.includes(exclusion.toUpperCase())) {
        logger.info(`Device ${hostname} excluded by pattern "${exclusion}"`);
        return true;
      }
    }
    
    return false;
  }

  
  async _validateDeviceReachability(device) {
    logger.info(`Checking TCP socket reachability for ${device.ipAddress}:22...`);
    const socketReachable =  this._isPortReachable(device.ipAddress, 22, 3000);
    
    if (socketReachable) {
      return true; // Device is reachable via its original IP
    }
    
    // If not reachable via TCP, try to do a forward lookup using device ID
    logger.info(`${device.ipAddress} not reachable via TCP, attempting forward DNS lookup...`);
    
    // Only proceed if we have a hostname (device ID from CDP/LLDP)
    if (device.hostname) {
      try {
        // Do a forward DNS lookup using the device ID/hostname
        logger.info(`Performing forward DNS lookup for device ID: ${device.hostname}...`);
        
        // Use the promises API for DNS lookup
        const address = dns.lookup(device.hostname);
        
        if (address && address.address !== device.ipAddress) {
          logger.info(`DNS lookup resolved ${device.hostname} to ${address.address}, checking if that's reachable...`);
          const resolvedReachable =  this._isPortReachable(address.address, 22, 3000);
          
          if (resolvedReachable) {
            logger.info(`DNS-resolved IP ${address.address} is reachable! Updating device IP for discovery.`);
            const originalIp = device.ipAddress;
            device.originalIp = originalIp;
            device.ipAddress = address.address;
            
            // Update the device reference in our device map
            if (this.discoveredDevices[originalIp]) {
              this.discoveredDevices[address.address] = device;
              delete this.discoveredDevices[originalIp];
              
              // Update the visitedIps set
              this.visitedIps.delete(originalIp);
              this.visitedIps.add(address.address);
            }
            
            return true;
          } else {
            logger.info(`DNS-resolved IP ${address.address} is also not reachable via TCP`);
          }
        } else {
          logger.info(`DNS lookup for ${device.hostname} returned the same address or failed`);
        }
      } catch (dnsErr) {
        logger.debug(`Forward DNS lookup failed for ${device.hostname}: ${dnsErr.message}`);
      }
    } else {
      // We don't have a device ID/hostname from CDP/LLDP
      logger.info(`No device ID/hostname available for ${device.ipAddress}. Cannot perform forward lookup.`);
    }
    
    // Mark device as failed if we couldn't reach it via its IP or DNS resolution
    device.failed = true;
    device.errorMsg = 'Device unreachable via TCP';
    device.reachabilityStatus = 'unreachable';
    this.failedIps.add(device.ipAddress);
    logger.info(`Device ${device.ipAddress} is unreachable - could not connect via TCP`);
    return false;
  }
  


  async _tryCredentials(host) {
    logger.debug(`=== Starting connection attempt for ${host} ===`);
    
    const DISCOVERY_TIMEOUT = 60000; // Your main discovery timeout
    const SOCKET_CHECK_TIMEOUT = Math.floor(DISCOVERY_TIMEOUT / 4); // 25% of discovery timeout
    const SSH_ATTEMPT_TIMEOUT = Math.floor(DISCOVERY_TIMEOUT / 3); // 33% of discovery timeout
    
    // First try a quick TCP socket check to see if the host is reachable
    logger.debug(`Performing TCP socket check on ${host}:22 with timeout ${SOCKET_CHECK_TIMEOUT}ms`);
    let socketReachable = false;
    
    try {
      const socketResult = await this._checkTcpSocket(host, 22, SOCKET_CHECK_TIMEOUT);
      socketReachable = socketResult.reachable;
      logger.debug(`TCP socket check for ${host}: ${socketReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
    } catch (socketErr) {
      logger.debug(`TCP socket check error for ${host}: ${socketErr.message}`);
    }
    
    // If the socket is reachable (or if it's an IP and was unreachable), try SSH connection
    if (socketReachable || net.isIP(host)) {
      logger.debug(`Attempting SSH connection to ${host}`);
      const sshResult = await this._trySshConnection(host, SSH_ATTEMPT_TIMEOUT);
      if (sshResult && sshResult.success) {
        logger.info(`Successfully connected to ${host} via direct SSH connection`);
        return {
          cred: sshResult.cred,
          client: sshResult.client,
          usedFallbackIp: false,
          connectedIp: host
        };
      } else {
        logger.debug(`Direct SSH connection to ${host} failed with all credentials`);
      }
    }
    
    logger.debug(`=== All connection attempts failed for ${host} ===`);
    return null;
  }
  
  // async _tryCredentials(host) {
  //   logger.debug(`=== Starting connection attempt for ${host} ===`);
    
  //   const DISCOVERY_TIMEOUT = 10000; // Your main discovery timeout
  //   const SOCKET_CHECK_TIMEOUT = Math.floor(DISCOVERY_TIMEOUT / 4); // 25% of discovery timeout
  //   const SSH_ATTEMPT_TIMEOUT = Math.floor(DISCOVERY_TIMEOUT / 3); // 33% of discovery timeout
  //   const DNS_ATTEMPT_TIMEOUT = Math.floor(DISCOVERY_TIMEOUT / 2); // 50% of discovery timeout
    
  //   // First try a quick TCP socket check to see if the host is reachable
  //   logger.debug(`Performing TCP socket check on ${host}:22 with timeout ${SOCKET_CHECK_TIMEOUT}ms`);
  //   let socketReachable = false;
    
  //   try {
  //     const socketResult = await this._checkTcpSocket(host, 22, SOCKET_CHECK_TIMEOUT);
  //     socketReachable = socketResult.reachable;
  //     logger.debug(`TCP socket check for ${host}: ${socketReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
  //   } catch (socketErr) {
  //     logger.debug(`TCP socket check error for ${host}: ${socketErr.message}`);
  //   }
    
  //   // If socket is unreachable and the host is not an IP, try DNS lookup immediately
  //   if (!socketReachable && !net.isIP(host)) {
  //     logger.info(`${host} is unreachable via TCP socket, attempting DNS lookup...`);
      
  //     try {
  //       const dnsStartTime = Date.now();
  //       const { address } = await dnsLookup(host);
  //       const dnsEndTime = Date.now();
        
  //       logger.debug(`DNS lookup for ${host} completed in ${dnsEndTime - dnsStartTime}ms, returned: ${address}`);
        
  //       if (address && address !== host) {
  //         logger.info(`DNS lookup for ${host} returned IP: ${address}. Testing socket reachability...`);
          
  //         // Check if the resolved IP is reachable via TCP
  //         try {
  //           const resolvedSocketResult = await this._checkTcpSocket(address, 22, SOCKET_CHECK_TIMEOUT);
  //           if (resolvedSocketResult.reachable) {
  //             logger.info(`DNS-resolved IP ${address} is reachable via TCP socket, will try SSH connection`);
              
  //             // Try SSH connection to the DNS-resolved IP
  //             const sshResult = await this._trySshConnection(address, DNS_ATTEMPT_TIMEOUT);
  //             if (sshResult && sshResult.success) {
  //               logger.info(`Successfully connected to ${host} via DNS-resolved IP ${address}`);
  //               return {
  //                 cred: sshResult.cred,
  //                 client: sshResult.client,
  //                 usedFallbackIp: true,
  //                 connectedIp: address
  //               };
  //             } else {
  //               logger.debug(`SSH connection to DNS-resolved IP ${address} failed with all credentials`);
  //             }
  //           } else {
  //             logger.info(`DNS-resolved IP ${address} is also unreachable via TCP socket`);
  //           }
  //         } catch (resolvedSocketErr) {
  //           logger.debug(`TCP socket check error for DNS-resolved IP ${address}: ${resolvedSocketErr.message}`);
  //         }
  //       } else {
  //         logger.info(`DNS lookup for ${host} returned the same address or failed`);
  //       }
  //     } catch (dnsErr) {
  //       logger.debug(`DNS lookup failed for ${host}: ${dnsErr.message}`);
  //     }
  //   }
    
  //   // If the socket is reachable (or if it's an IP and was unreachable), try SSH connection
  //   if (socketReachable || net.isIP(host)) {
  //     logger.debug(`Attempting SSH connection to ${host}`);
  //     const sshResult = await this._trySshConnection(host, SSH_ATTEMPT_TIMEOUT);
  //     if (sshResult && sshResult.success) {
  //       logger.info(`Successfully connected to ${host} via direct SSH connection`);
  //       return {
  //         cred: sshResult.cred,
  //         client: sshResult.client,
  //         usedFallbackIp: false,
  //         connectedIp: host
  //       };
  //     } else {
  //       logger.debug(`Direct SSH connection to ${host} failed with all credentials`);
  //     }
  //   }
    
  //   logger.debug(`=== All connection attempts failed for ${host} ===`);
  //   return null;
  // }
  
  // New helper method to check TCP socket reachability
  async _checkTcpSocket(host, port = 22, timeout = 2000) {
    return new Promise((resolve) => {
      logger.debug(`Opening TCP socket to ${host}:${port} with timeout ${timeout}ms`);
      
      const socket = new net.Socket();
      let resolved = false;
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logger.debug(`TCP socket to ${host}:${port} connected successfully`);
          resolve({ reachable: true, host, port });
        }
      });
      
      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logger.debug(`TCP socket to ${host}:${port} timed out after ${timeout}ms`);
          resolve({ reachable: false, host, port, error: 'Connection timeout' });
        }
      });
      
      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logger.debug(`TCP socket to ${host}:${port} error: ${err.message}`);
          resolve({ reachable: false, host, port, error: err.message });
        }
      });
      
      // Start connection attempt
      try {
        socket.connect(port, host);
      } catch (e) {
        if (!resolved) {
          resolved = true;
          logger.debug(`TCP socket exception during connect: ${e.message}`);
          resolve({ reachable: false, host, port, error: e.message });
        }
      }
    });
  }
  
  // New helper method to try SSH connection with all credentials
  async _trySshConnection(host, timeout) {
    for (const cred of this.credentials) {
      try {
        logger.debug(`Trying SSH credential: ${cred.username} on ${host}:${cred.port} with timeout ${timeout}ms`);
        
        const sshOptions = new SSHClientOptions({
          host: host,
          username: cred.username,
          password: cred.password,
          port: cred.port,
          timeout: timeout,
          invokeShell: true, // Set to true to ensure shell mode is used
          outputCallback: function() {}
        });
  
        const client = new SynchronousSSHClient(sshOptions);
        logger.debug(`Initiating SSH connection to ${host}...`);
        await client.connect();
        logger.debug(`SSH connection established with ${host}`);
  
        // We don't need to create a shell here as it will be created in _discoverDevice
        // Also, don't try enable mode here - we'll handle that after proper shell setup
  
        logger.info(`Successfully connected to ${host} with ${cred.username}`);
        return {
          success: true,
          cred: cred,
          client: client
        };
      } catch (e) {
        logger.debug(`SSH connection attempt to ${host} with ${cred.username} failed: ${e.message}`);
        continue;
      }
    }
    
    return { success: false };
  }

  async _disablePagination(client, prompt) {
    const paginationCommands = [
      'terminal length 0',
      'terminal pager 0',
      'set cli screen-length 0'
    ];
  
    // Use a reasonable timeout for pagination commands
    const paginationTimeout = 10000; // 10 seconds
    
    // Special handling for prompts with newlines
    let cleanPrompt = prompt;
    if (prompt.includes('\n')) {
      logger.debug(`Detected prompt with newline character: "${prompt.replace(/\n/g, '\\n')}"`);
      // Remove the newline for matching purposes
      cleanPrompt = prompt.replace(/[\r\n]+$/, '');
      logger.debug(`Cleaned prompt for matching: "${cleanPrompt}"`);
    }
  
    // Try each pagination command
    for (const cmd of paginationCommands) {
      try {
        logger.info(`Disabling pagination with: ${cmd}`);
        
        // Use direct command sending and manual output collection
        // This bypasses the standard executeShellCommand method which might be having issues
        if (client._shellReady) {
          // Clear buffer before sending command
          client._outputBuffer = '';
          
          // Send the command
          client.sendCommand(cmd);
          
          // Wait for output with timeout
          let success = false;
          const startTime = Date.now();
          
          // Create a promise that resolves when we see the prompt or times out
          const promptResult = await new Promise((resolve) => {
            // Function to check for prompt
            const checkForPrompt = () => {
              const output = client._outputBuffer;
              
              // Check for various prompt formats
              if (output.includes(prompt) || 
                  output.includes(cleanPrompt) || 
                  output.endsWith(cleanPrompt) ||
                  output.endsWith(cleanPrompt + ' ')) {
                
                logger.debug(`Detected prompt after pagination command. Buffer: "${output.substring(output.length - 50)}"`);
                resolve({ found: true, output });
                return true;
              }
              
              // Check timeout
              if (Date.now() - startTime > paginationTimeout) {
                logger.debug(`Timeout waiting for prompt after pagination command`);
                resolve({ found: false, timeout: true, output });
                return true;
              }
              
              // Continue checking
              return false;
            };
            
            // Check immediately
            if (!checkForPrompt()) {
              // Set up an interval to check for the prompt
              const checkInterval = setInterval(() => {
                if (checkForPrompt()) {
                  clearInterval(checkInterval);
                }
              }, 250); // Check every 250ms
              
              // Also set a timeout to ensure we don't hang
              setTimeout(() => {
                clearInterval(checkInterval);
                resolve({ found: false, timeout: true, output: client._outputBuffer });
              }, paginationTimeout);
            }
          });
          
          // Process result
          if (promptResult.found) {
            logger.info(`Successfully disabled pagination with: ${cmd}`);
            return true;
          } else {
            logger.debug(`Command "${cmd}" did not return expected prompt, output: "${promptResult.output.substring(0, 100)}..."`);
          }
        } else {
          logger.error(`Shell not ready, cannot send pagination command`);
        }
      } catch (e) {
        logger.debug(`Error with pagination command ${cmd}: ${e.message}`);
      }
    }
  
    // If we get here, all commands failed
    logger.warning(`All pagination disable commands failed, but continuing anyway`);
    return false;
  }

  
  _extractHostnameFromPrompt(prompt) {
    if (!prompt) return null;
    
    // Remove prompt characters and clean up
    let hostname = prompt.replace(/[>#]/g, '').trim();
    
    // Handle configuration mode prompts like "switch1(config)#"
    if (hostname.includes('(')) {
      hostname = hostname.substring(0, hostname.indexOf('('));
    }
    
    return hostname;
  }

  // Add this method to the NetworkDiscovery class

// Make sure this is defined as a method directly in the NetworkDiscovery class
// This should be placed where other methods of NetworkDiscovery are defined
async _processNeighbors(device, allOutputs) {
    const newNeighbors = [];
    const neighborsFound = [];
    this.retryQueue = [];
    // Parse neighbor data
    for (const [cmd, output] of Object.entries(allOutputs)) {
      if (cmd.toLowerCase().includes('cdp neighbor') || 
          cmd.toLowerCase().includes('lldp neighbor')) {
        const parsed = this.parser.parse(output);
        if (parsed && parsed.length > 0) {
          parsed.forEach(neighbor => {
            neighbor.discovered_via = cmd;  // Store the command that discovered this neighbor
          });
          neighborsFound.push(...parsed);
        }
      }
    }
  
    if (neighborsFound.length > 0) {
      logger.info(`Found ${neighborsFound.length} neighbors for ${device.ipAddress}`);
      device.neighbors = neighborsFound.slice(); // Create a copy instead of using spread
      
      // Extract interface information for mapping
      device.localInterfaces = device.localInterfaces || {};
      
      // Process neighbors synchronously to ensure ALL checks complete before returning
      for (const neighbor of neighborsFound) {
        let neighborIp = null;
        let localInterface = null;
        let remoteInterface = null;
  
        // Try to find IP address in various fields
        const ipFields = [
          'mgmt_address', 'management_ip', 'ip_address', 'neighbor_ip',
          'MGMT_ADDRESS', 'IP_ADDRESS', 'NEIGHBOR_IP'  // Uppercase versions
        ];
        
        for (const field of ipFields) {
          if (neighbor[field]) {
            neighborIp = neighbor[field].trim();
            break;
          }
        }
  
        // Check nested structure
        if (!neighborIp && neighbor.neighbors && typeof neighbor.neighbors === 'object') {
          const nested = neighbor.neighbors;
          for (const field of ipFields) {
            if (nested[field]) {
              neighborIp = nested[field].trim();
              break;
            }
          }
        }
  
        // Skip if no valid IP found
        if (!neighborIp || !this._isValidIpAddress(neighborIp)) {
          logger.debug(`Skipping neighbor with invalid IP: ${JSON.stringify(neighbor)}`);
          continue;
        }
  
        // Extract interface information
        const interfaceFields = {
          local: [
            'local_interface', 'local_intf', 'interface', 'port', 'local_port',
            'LOCAL_INTERFACE'  // Uppercase version
          ],
          remote: [
            'remote_interface', 'remote_intf', 'neighbor_interface', 'port_id', 'remote_port',
            'NEIGHBOR_INTERFACE'  // Uppercase version
          ]
        };
  
        // Try direct fields for local interface
        for (const field of interfaceFields.local) {
          if (neighbor[field]) {
            localInterface = neighbor[field].trim();
            break;
          }
        }
  
        // Try direct fields for remote interface
        for (const field of interfaceFields.remote) {
          if (neighbor[field]) {
            remoteInterface = neighbor[field].trim();
            break;
          }
        }
  
        // Check nested structure for interfaces
        if (neighbor.neighbors && typeof neighbor.neighbors === 'object') {
          const nested = neighbor.neighbors;
          if (!localInterface) {
            for (const field of interfaceFields.local) {
              if (nested[field]) {
                localInterface = nested[field].trim();
                break;
              }
            }
          }
          if (!remoteInterface) {
            for (const field of interfaceFields.remote) {
              if (nested[field]) {
                remoteInterface = nested[field].trim();
                break;
              }
            }
          }
        }
  
        // Store interface information for mapping
        if (localInterface && neighborIp) {
          device.localInterfaces[localInterface] = {
            connectedTo: neighborIp,
            remoteInterface: remoteInterface,
            discoveredVia: neighbor.discovered_via
          };
        }
  
        // Add interface information to device's interfaces array
        if (localInterface && !device.interfaces.some(intf => intf.name === localInterface)) {
          device.interfaces.push({
            name: localInterface,
            connectedTo: neighborIp,
            remoteInterface: remoteInterface,
            status: 'up',  // Assumed from neighbor discovery
            type: neighbor.discovered_via && neighbor.discovered_via.includes('cdp') ? 'cdp' : 'lldp'
          });
        }
  
        // Check if we should add this neighbor to the discovery queue
        if (!this.discoveredDevices[neighborIp] && 
            !this.visitedIps.has(neighborIp) && 
            !this.failedIps.has(neighborIp)) {
          
          // Extract hostname
          let hostname = null;
          const hostnameFields = [
            'neighbor_name', 'device_id', 'hostname', 'neighbor', 'system_name',
            'NEIGHBOR_NAME', 'DEVICE_ID', 'HOSTNAME'  // Uppercase versions
          ];
          
          for (const field of hostnameFields) {
            if (neighbor[field]) {
              hostname = neighbor[field].trim();
              break;
            }
          }
  
          // Check nested structure for hostname
          if (!hostname && neighbor.neighbors && typeof neighbor.neighbors === 'object') {
            const nested = neighbor.neighbors;
            for (const field of hostnameFields) {
              if (nested[field]) {
                hostname = nested[field].trim();
                break;
              }
            }
          }
  
          if (!hostname) {
            hostname = `unknown-${neighborIp}`;
          }
  
          // Extract platform information
          let platform = neighbor.platform || neighbor.PLATFORM;
          if (!platform && neighbor.neighbors && neighbor.neighbors.platform) {
            platform = neighbor.neighbors.platform;
          }
  
          // Extract capabilities
          let capabilities = neighbor.capabilities || neighbor.CAPABILITIES;
          if (!capabilities && neighbor.neighbors && neighbor.neighbors.capabilities) {
            capabilities = neighbor.neighbors.capabilities;
          }
  
          // exclusion logic
          if (this._shouldExcludeDevice(hostname)) {
            logger.info(`Excluding device from discovery: ${hostname} (${neighborIp})`);
            continue;  // Skip to next neighbor
          }
  
          // Create new device object
          const newDevice = new DiscoveredDevice({
            hostname: hostname,
            ipAddress: neighborIp,
            platform: platform,
            parent: device.ipAddress,
            hopCount: device.hopCount + 1,
            capabilities: capabilities ? capabilities.split(' ') : [],
            managementIp: neighbor.mgmt_address || neighbor.management_ip || neighbor.MGMT_ADDRESS
          });
  
          // Store basic interface information for the new device
          if (remoteInterface) {
            newDevice.interfaces.push({
              name: remoteInterface,
              connectedTo: device.ipAddress,
              remoteInterface: localInterface,
              status: 'up',
              type: neighbor.discovered_via && neighbor.discovered_via.includes('cdp') ? 'cdp' : 'lldp'
            });
          }
  
          // Check TCP port 22 reachability before adding to queue - process synchronously
          logger.info(`Checking TCP port 22 reachability for neighbor: ${neighborIp} (${hostname})`);
          let socketReachable = false;
          try {
            socketReachable = await this._isPortReachable(neighborIp, 22, 1000); // 1 second timeout
          } catch (err) {
            logger.error(`Error checking port reachability: ${err.message}`);
            socketReachable = false;
          }
          
          if (socketReachable) {
            logger.info(`TCP port 22 is open for ${neighborIp} (${hostname}), adding to discovery queue`);
            this.discoveredDevices[neighborIp] = newDevice;
            newNeighbors.push(newDevice);
            logger.info(`Added new neighbor to queue: ${neighborIp} (${hostname})`);
          } else {
            logger.info(`TCP port 22 is NOT open for ${neighborIp} (${hostname}), trying forward DNS lookup`);
            
            // Try to resolve the hostname via DNS lookup
            try {
              // Only attempt DNS lookup if we have a valid hostname (not just an IP or unknown)
              if (hostname && !hostname.startsWith('unknown-') && !this._isValidIpAddress(hostname)) {
                // Use promisify instead of dns.promises to match existing code style
                const dnsLookup = promisify(dns.lookup);
                const address = await dnsLookup(device.hostname);
                const addressResult = await dnsLookup(hostname).catch(err => {
                  logger.error(`DNS lookup error: ${err.message}`);
                  return null;
                });
                
                if (addressResult && addressResult.address && addressResult.address !== neighborIp) {
                  const address = addressResult.address;
                  logger.info(`DNS lookup for ${hostname} resolved to ${address}, checking port 22`);
                  
                  // Check if the resolved IP is reachable on port 22
                  let resolvedReachable = false;
                  try {
                    resolvedReachable = await this._isPortReachable(address, 22, 1000); // 1 second timeout
                  } catch (err) {
                    logger.error(`Error checking port reachability for resolved IP: ${err.message}`);
                    resolvedReachable = false;
                  }
                  
                  if (resolvedReachable) {
                    logger.info(`TCP port 22 is open for DNS-resolved IP ${address}, updating neighbor IP`);
                    
                    // Update the neighbor IP to the resolved address
                    newDevice.originalIp = neighborIp;
                    newDevice.ipAddress = address;
                    
                    // Add to discovery queue with the new IP
                    this.discoveredDevices[address] = newDevice;
                    newNeighbors.push(newDevice);
                    logger.info(`Added new neighbor to queue with resolved IP: ${address} (${hostname})`);
                  } else {
                    logger.info(`TCP port 22 is NOT open for DNS-resolved IP ${address}, skipping neighbor`);
                  }
                } else {
                  logger.info(`DNS lookup for ${hostname} returned the same address or failed, skipping neighbor`);
                }
              } else {
                logger.info(`No valid hostname to perform DNS lookup for ${neighborIp}, skipping neighbor`);
              }
            } catch (dnsErr) {
              logger.debug(`DNS lookup failed for ${hostname}: ${dnsErr.message}, skipping neighbor`);
            }
          }
        } 
        // If device already exists, update interface information
        else if (this.discoveredDevices[neighborIp] && localInterface && remoteInterface) {
          const existingDevice = this.discoveredDevices[neighborIp];
          
          // Add reverse interface mapping if not already present
          if (!existingDevice.localInterfaces) {
            existingDevice.localInterfaces = {};
          }
          
          if (!existingDevice.localInterfaces[remoteInterface]) {
            existingDevice.localInterfaces[remoteInterface] = {
              connectedTo: device.ipAddress,
              remoteInterface: localInterface,
              discoveredVia: neighbor.discovered_via
            };
          }
          
          // Add to interfaces array if not already present
          if (!existingDevice.interfaces) {
            existingDevice.interfaces = [];
          }
          
          if (!existingDevice.interfaces.some(intf => intf.name === remoteInterface)) {
            existingDevice.interfaces.push({
              name: remoteInterface,
              connectedTo: device.ipAddress,
              remoteInterface: localInterface,
              status: 'up',
              type: neighbor.discovered_via && neighbor.discovered_via.includes('cdp') ? 'cdp' : 'lldp'
            });
          }
        }
      }
    } else {
      logger.info(`No neighbors found for ${device.ipAddress}`);
    }
  
    // Add a delay to ensure all async operations complete before returning
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.info(`Completed neighbor processing for ${device.ipAddress}, returning ${newNeighbors.length} new neighbors`);
    return newNeighbors;
  }
  


  async _discoverDevice(device, hop) {
    const newNeighbors = [];
    const DISCOVERY_TIMEOUT = 60000; // 20 seconds max for discovery
    let discoveryTimer = null;
    let client = null; // Define client at the method level
    
    // Check if device is already visited
    if (device.visited || 
        this.visitedIps.has(device.ipAddress) || 
        (device.hostname && device.hostname.trim() !== '' && this.visitedHostnames.has(device.hostname))) {
      
      logger.info(`Device ${device.ipAddress} (${device.hostname || 'unknown'}) already visited, skipping discovery`);
      
      // Still mark as visited to be sure
      device.visited = true;
      this.visitedIps.add(device.ipAddress);
      if (device.hostname && device.hostname.trim() !== '') {
        this.visitedHostnames.add(device.hostname);
      }
      
      return newNeighbors;
    }
  
    this.visitedIps.add(device.ipAddress);
    device.visited = true;
  
    logger.info(`\n=== Discovering ${device.ipAddress} (${device.hostname || 'unknown'}) at hop ${hop} ===`);
  
    // Do a quick socket check before starting the full discovery process
    logger.info(`Checking TCP socket reachability for ${device.ipAddress}:22...`);
    let socketReachable = false;
    
    try {
      socketReachable = await this._isPortReachable(device.ipAddress, 22, 3000);
    } catch (err) {
      logger.error(`Error checking port reachability for ${device.ipAddress}: ${err.message}`);
      socketReachable = false;
    }
    
    if (!socketReachable) {
      // If not reachable via TCP, try to do a forward lookup using device ID
      logger.info(`${device.ipAddress} not reachable via TCP, attempting forward DNS lookup...`);
      
      // Only proceed if we have a hostname (device ID from CDP/LLDP)
      if (device.hostname) {
        try {
          // Do a forward DNS lookup using the device ID/hostname
          logger.info(`Performing forward DNS lookup for device ID: ${device.hostname}...`);
          
          // Use the promises API for DNS lookup
          const dnsLookup = promisify(dns.lookup);
          const address = await dnsLookup(device.hostname).catch(err => {
            logger.error(`DNS lookup error for ${device.hostname}: ${err.message}`);
            return null;
          });
          
          if (address && address.address && address.address !== device.ipAddress) {
            logger.info(`DNS lookup resolved ${device.hostname} to ${address.address}, checking if that's reachable...`);
            let resolvedReachable = false;
            
            try {
              resolvedReachable = await this._isPortReachable(address.address, 22, 3000);
            } catch (err) {
              logger.error(`Error checking port reachability for resolved IP ${address.address}: ${err.message}`);
              resolvedReachable = false;
            }
            
            if (resolvedReachable) {
              logger.info(`DNS-resolved IP ${address.address} is reachable! Updating device IP for discovery.`);
              const originalIp = device.ipAddress;
              device.originalIp = originalIp;
              device.ipAddress = address.address;
              // we want to continue on from here with the new address
            } else {
              logger.info(`DNS-resolved IP ${address.address} is also not reachable via TCP`);
            }
          } else {
            logger.info(`DNS lookup for ${device.hostname} returned the same address or failed`);
          }
        } catch (dnsErr) {
          logger.debug(`Forward DNS lookup failed for ${device.hostname}: ${dnsErr.message}`);
        }
      } else {
        // We don't have a device ID/hostname from CDP/LLDP
        logger.info(`No device ID/hostname available for ${device.ipAddress}. Cannot perform forward lookup.`);
      }
    }
  
    // Set up the overall timeout
    const timeoutPromise = new Promise((_, reject) => {
      discoveryTimer = setTimeout(() => {
        reject(new Error(`Discovery timeout for ${device.ipAddress}`));
      }, DISCOVERY_TIMEOUT);
    });
  
    // Create the discovery promise
    const discoveryPromise = (async () => {
      try {
        // Add debug for connection attempt
        logger.debug(`Attempting to connect to ${device.ipAddress}...`);
        
        // Try to connect
        const result = await this._tryCredentials(device.ipAddress);
        if (!result) {
          device.failed = true;
          device.errorMsg = 'No valid credentials';
          device.reachabilityStatus = 'unreachable';
          this.failedIps.add(device.ipAddress);
          logger.info(`Device ${device.ipAddress} is unreachable - no valid credentials found`);
          return newNeighbors;
        }
  
        // Add debug for successful connection
        logger.debug(`Successfully connected to ${device.ipAddress} with credentials`);
  
        const { cred, client, usedFallbackIp, connectedIp } = result;
        device.successfulCredentials = cred.username;
        device.reachabilityStatus = 'reachable';
        device.hopCount = hop;
        
        // If we connected using a fallback IP (from _tryCredentials), update the device record
        if (usedFallbackIp && connectedIp) {
          logger.info(`Successfully connected to ${device.ipAddress} using fallback IP: ${connectedIp}`);
          
          // Store the original IP for reference
          const originalIp = device.ipAddress;
          device.originalIp = originalIp;
          
          // Update the device IP
          device.ipAddress = connectedIp;
          
          // Defer reference updates until *after* the current device processing is complete
          // Store this information for post-processing
          device._pendingIpUpdate = {
            oldIp: originalIp,
            newIp: connectedIp
          };
        }
  
        // Reset the failed flag since we've successfully connected
        device.failed = false;
        device.errorMsg = null;
        
        // IMPORTANT: Initialize the shell before trying to find the prompt
        logger.debug(`Initializing shell for ${device.ipAddress}...`);
        await client.createShell();
        
        // Add debug for prompt detection
        logger.debug(`Attempting to find prompt on ${device.ipAddress}...`);
        
        // Use the findPrompt method after shell initialization
        let prompt = '';
        try {
          prompt = await client.findPrompt(client._outputBuffer);
        } catch (err) {
          logger.error(`Error finding prompt: ${err.message}`);
        }
        
        if (!prompt) {
          logger.warning(`Could not detect prompt for ${device.ipAddress}, using default '#'`);
          prompt = '#';
        }
        
        logger.info(`Using prompt: "${prompt}"`);
  
        // Extract hostname from prompt if available
        if (prompt) {
          const extractedHostname = this._extractHostnameFromPrompt(prompt);
          if (extractedHostname && !device.hostname) {
            device.hostname = extractedHostname;
            logger.info(`Extracted hostname from prompt: ${extractedHostname}`);
          }
        }
  
        // Add debug for pagination
        logger.debug(`Attempting to disable pagination on ${device.ipAddress}...`);
        
        // Disable pagination
        let paginationDisabled = false;
        try {
          paginationDisabled = await this._disablePagination(client, prompt);
        } catch (err) {
          logger.error(`Error disabling pagination: ${err.message}`);
        }
        
        if (!paginationDisabled) {
          logger.warning(`Failed to disable pagination on ${device.ipAddress}`);
        } else {
          logger.debug(`Successfully disabled pagination on ${device.ipAddress}`);
        }
  
        // Add debug for device info commands
        logger.debug(`Starting execution of ${this.deviceInfoCommands.length} device info commands on ${device.ipAddress}`);
        
        // Execute device information commands
        let deviceInfo = {};
        try {
          deviceInfo = await this._executeDeviceInfoCommands(client, prompt);
        } catch (err) {
          logger.error(`Error executing device info commands: ${err.message}`);
        }
        
        this._updateDeviceInfo(device, deviceInfo);
  
        // Add debug for discovery commands
        logger.debug(`Starting execution of ${this.discoveryCommands.length} discovery commands on ${device.ipAddress}`);
        
        // Execute discovery commands
        let allOutputs = {};
        try {
          allOutputs = await this._executeDiscoveryCommands(client, prompt);
        } catch (err) {
          logger.error(`Error executing discovery commands: ${err.message}`);
        }
  
        // Add debug for neighbor processing
        logger.debug(`Processing neighbor information for ${device.ipAddress}...`);
        
        // Parse and process neighbor information
        const neighbors = await this._processNeighbors(device, allOutputs);
        
        // Ensure we have a valid array
        if (neighbors && Array.isArray(neighbors)) {
          newNeighbors.push(...neighbors);
        } else {
          logger.error(`Invalid neighbors result for ${device.ipAddress}: ${typeof neighbors}`);
        }
        
      } catch (e) {
        logger.error(`Error discovering ${device.ipAddress}: ${e.message}`);
        logger.debug(e.stack);
        device.failed = true;
        device.errorMsg = e.message;
      } finally {
        try {
          if (client) {
            logger.debug(`Disconnecting SSH session for ${device.ipAddress}...`);
            client.disconnect();
          }
        } catch (e) {
          // Ignore disconnect errors
          logger.debug(`Error during SSH disconnect for ${device.ipAddress}: ${e.message}`);
        }
        device.lastUpdate = new Date().toISOString();
      }
  
      // Ensure we always return an array
      return Array.isArray(newNeighbors) ? newNeighbors : [];
    })();
  
    try {
      // Race between the discovery process and the timeout
      const result = await Promise.race([discoveryPromise, timeoutPromise]);
      
      // Now apply the deferred IP update if needed
      if (device._pendingIpUpdate) {
        const { oldIp, newIp } = device._pendingIpUpdate;
        
        logger.info(`Applying deferred IP update for device: ${oldIp} -> ${newIp}`);
        
        // Update the references safely now that we're done processing this device
        if (this.discoveredDevices[oldIp]) {
          // Create a new entry with the new IP
          this.discoveredDevices[newIp] = device;
          // Delete the old reference
          delete this.discoveredDevices[oldIp];
          
          // Update tracking sets
          this.visitedIps.delete(oldIp);
          this.visitedIps.add(newIp);
          
          // Also check and update failedIps if necessary
          if (this.failedIps.has(oldIp)) {
            this.failedIps.delete(oldIp);
            // Only add to failedIps if it's actually failed
            if (device.failed) {
              this.failedIps.add(newIp);
            }
          }
          
          logger.info(`Updated device references from ${oldIp} to ${newIp}`);
        }
        
        // Clean up the temporary field
        delete device._pendingIpUpdate;
      }
      
      // Ensure we return an array
      return Array.isArray(result) ? result : [];
    } catch (error) {
      // If timeout occurs, mark device as failed
      logger.error(`${error.message}`);
      device.failed = true;
      device.errorMsg = error.message;
      
      // Always return an array, even on error
      return [];
    } finally {
      // Clear the timeout if it's still running
      if (discoveryTimer) {
        clearTimeout(discoveryTimer);
      }
    }
  }

  // Helper method for TCP port reachability check
  async _isPortReachable(host, port = 22, timeout = 3000) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logger.info(`TCP socket to ${host}:${port} connected successfully`);
          resolve(true);
        }
      });
      
      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logger.info(`TCP socket to ${host}:${port} timed out after ${timeout}ms`);
          resolve(false);
        }
      });
      
      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logger.info(`TCP socket to ${host}:${port} error: ${err.message}`);
          resolve(false);
        }
      });
      
      try {
        socket.connect(port, host);
      } catch (e) {
        if (!resolved) {
          resolved = true;
          logger.info(`TCP socket exception during connect: ${e.message}`);
          resolve(false);
        }
      }
    });
  }

// Add this method to NetworkDiscovery class

async _executeCommandWithDirectPromptDetection(client, command, prompt, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!client._shellReady) {
      reject(new Error('Shell not ready'));
      return;
    }
    
    // Clean prompt for better matching
    let cleanPrompt = prompt;
    if (prompt.includes('\n')) {
      logger.debug(`Cleaning prompt with newline: "${prompt.replace(/\n/g, '\\n')}"`);
      cleanPrompt = prompt.replace(/[\r\n]+$/, '');
    }
    
    // Clear the output buffer
    client._outputBuffer = '';
    
    // Send the command
    logger.debug(`Executing command with direct prompt detection: ${command}`);
    client.sendCommand(command);
    
    const startTime = Date.now();
    let outputBuffer = '';
    
    // Function to check if output contains our prompt
    const checkForPrompt = (data) => {
      outputBuffer += data;
      
      // Different ways to match the prompt
      const exactMatch = outputBuffer.includes(prompt);
      const cleanMatch = outputBuffer.includes(cleanPrompt);
      const endsWithPrompt = outputBuffer.endsWith(cleanPrompt) || 
                             outputBuffer.endsWith(cleanPrompt + ' ');
      
      // Check for common prompt endings
      const lines = outputBuffer.split('\n');
      const lastLine = lines[lines.length - 1].trim();
      const promptPatternMatch = lastLine.endsWith('#') || 
                                lastLine.endsWith('>') || 
                                lastLine.endsWith('$');
      
      if (exactMatch || cleanMatch || endsWithPrompt) {
        logger.debug(`Prompt detected after command "${command}"`);
        cleanup();
        resolve(outputBuffer);
        return true;
      }
      
      // Check if we have timeout
      if (Date.now() - startTime > timeout) {
        // If we have some output and it looks like it might have ended, resolve anyway
        if (outputBuffer.length > 0 && promptPatternMatch) {
          logger.debug(`Command timeout but prompt-like pattern detected, accepting output`);
          cleanup();
          resolve(outputBuffer);
        } else {
          logger.debug(`Command timeout with no prompt detection`);
          cleanup();
          reject(new Error(`Timeout waiting for prompt after command: ${command}`));
        }
        return true;
      }
      
      return false;
    };
    
    // Set up the data handler
    const dataHandler = (data) => {
      checkForPrompt(data);
    };
    
    // Clean up function
    const cleanup = () => {
      client.removeListener('data', dataHandler);
      clearInterval(checkInterval);
      clearTimeout(timeoutHandle);
    };
    
    // Listen for data
    client.on('data', dataHandler);
    
    // Set up periodic checking (some devices might not trigger the data event reliably)
    const checkInterval = setInterval(() => {
      // Check if the current buffer contains our prompt
      if (client._outputBuffer !== outputBuffer) {
        const newData = client._outputBuffer.substring(outputBuffer.length);
        if (newData.length > 0) {
          checkForPrompt(newData);
        }
      }
    }, 250);
    
    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      if (outputBuffer.length > 0) {
        // We have some output, try to check if it might have the prompt
        const lines = outputBuffer.split('\n');
        const lastLine = lines[lines.length - 1].trim();
        
        if (lastLine.endsWith('#') || lastLine.endsWith('>') || lastLine.endsWith('$')) {
          logger.debug(`Timeout but prompt-like ending detected, accepting output`);
          cleanup();
          resolve(outputBuffer);
        } else {
          logger.debug(`Command timeout with no prompt-like ending`);
          cleanup();
          reject(new Error(`Timeout waiting for prompt after command: ${command}`));
        }
      } else {
        logger.debug(`Command timeout with no output`);
        cleanup();
        reject(new Error(`Timeout with no output for command: ${command}`));
      }
    }, timeout);
  });
}

// Replace this method with a better implementation using direct prompt detection
async _executeDeviceInfoCommands(client, prompt) {
  const deviceInfo = {};

  for (const cmd of this.deviceInfoCommands) {
    try {
      logger.info(`Executing device info command: ${cmd}`);
      
      // Use the direct prompt detection method
      const output = await this._executeCommandWithDirectPromptDetection(client, cmd, prompt, 15000);
      const cleanedOutput = this.parser._cleanText(output);
      deviceInfo[cmd] = cleanedOutput;
      
      // Try to extract hostname specifically
      if (cmd.includes('hostname')) {
        const hostnameMatch = /hostname\s+(\S+)/i.exec(cleanedOutput);
        if (hostnameMatch) {
          deviceInfo.extracted_hostname = hostnameMatch[1];
        }
      }
    } catch (e) {
      logger.debug(`Error executing ${cmd}: ${e.message}`);
    }
  }

  return deviceInfo;
}

// Replace this method with a better implementation using direct prompt detection
async _executeDiscoveryCommands(client, prompt) {
  const allOutputs = {};

  for (const cmd of this.discoveryCommands) {
    try {
      logger.info(`Executing command: ${cmd}`);
      
      // Use the direct prompt detection method
      const output = await this._executeCommandWithDirectPromptDetection(client, cmd, prompt, 30000);
      
      // Clean the output
      const cleanedOutput = this.parser._cleanText(output);

      // Check for actual command errors (not just disabled protocols)
      const errorIndicators = [
        'invalid input',
        'incomplete command', 
        'unknown command',
        '% invalid',
        '% ambiguous command'
      ];
      
      const protocolDisabledMessages = [
        'not enabled',
        'not running',
        'is disabled',
        'not configured'
      ];
      
      let isCommandError = false;
      let isProtocolDisabled = false;
      
      // Check for command errors
      for (const error of errorIndicators) {
        if (cleanedOutput.toLowerCase().includes(error)) {
          isCommandError = true;
          logger.info(`Command error detected for ${cmd}: ${error}`);
          break;
        }
      }
      
      // Check if protocol is simply disabled
      for (const message of protocolDisabledMessages) {
        if (cleanedOutput.toLowerCase().includes(message)) {
          isProtocolDisabled = true;
          logger.info(`Protocol disabled for ${cmd}: ${message}`);
          break;
        }
      }

      // If command errored, skip it
      if (isCommandError) {
        logger.info(`Skipping ${cmd} due to command error`);
        continue;
      }

      // If protocol is disabled, that's OK - just note it
      if (isProtocolDisabled) {
        logger.info(`${cmd} - protocol not enabled on this device`);
        continue;
      }

      // Check if LLDP/CDP output contains actual neighbor data
      if (cmd.toLowerCase().includes('lldp') || cmd.toLowerCase().includes('cdp')) {
        const hasNeighborData = cleanedOutput.toLowerCase().includes('chassis id') || 
                                cleanedOutput.toLowerCase().includes('device id') ||
                                cleanedOutput.toLowerCase().includes('local intf') ||
                                cleanedOutput.toLowerCase().includes('interface');
        
        if (!hasNeighborData && !isProtocolDisabled) {
          logger.info(`${cmd} - no neighbors found`);
          // Still save the output even if no neighbors
        }
      }

      // Store the output
      allOutputs[cmd] = cleanedOutput;
      logger.info(`Command successful: ${cmd}`);
      
    } catch (e) {
      logger.error(`Error executing ${cmd}: ${e.message}`);
      continue;
    }
  }

  return allOutputs;
}
  _updateDeviceInfo(device, deviceInfo) {
    // Update hostname if found
    if (deviceInfo.extracted_hostname && !device.hostname) {
      device.hostname = deviceInfo.extracted_hostname;
      logger.info(`Updated hostname from command: ${device.hostname}`);
    }

    // Store raw command outputs
    device.rawData = { ...device.rawData, ...deviceInfo };

    // Try to extract additional device information
    const versionOutput = deviceInfo['show version'] || '';
    
    // Extract serial number
    const serialMatch = /(?:Processor board ID|Serial Number)[:\s]+(\S+)/i.exec(versionOutput);
    if (serialMatch && !device.serialNumber) {
      device.serialNumber = serialMatch[1];
    }

    // Extract model
    const modelMatch = /Model number[:\s]+([^\n]+)/i.exec(versionOutput);
    if (modelMatch && !device.model) {
      device.model = modelMatch[1].trim();
    }

    // Extract software version
    const versionMatch = /Version\s+([^,\s]+)/i.exec(versionOutput);
    if (versionMatch && !device.softwareVersion) {
      device.softwareVersion = versionMatch[1];
    }
  }



  // Add this method to NetworkDiscovery class to check exclusions
_shouldExcludeDevice(hostname) {
  if (!hostname || this.exclusions.length === 0) {
    return false;
  }
  
  const hostnameUpper = hostname.toUpperCase();
  for (const exclusion of this.exclusions) {
    if (hostnameUpper.includes(exclusion.toUpperCase())) {
      logger.info(`Device ${hostname} excluded by pattern "${exclusion}"`);
      return true;
    }
  }
  
  return false;
}

async discoverSingleThreaded(seedDevices, maxHops = 10) {
    let currentHop = 0;
    const devicesByHop = {};
    this.retryQueue = this.retryQueue || []; // Initialize retry queue if not already done
    
    // Ensure tracking sets are initialized
    this.visitedIps = this.visitedIps || new Set();
    this.failedIps = this.failedIps || new Set();
    this.visitedHostnames = this.visitedHostnames || new Set();
    
    // Initialize with seed devices at hop 0
    devicesByHop[0] = [];
    for (const device of seedDevices) {
      const hostname = device.hostname || '';
      const ipAddress = device.ip_address;
      
      const dev = new DiscoveredDevice({
        hostname: hostname,
        ipAddress: ipAddress,
        hopCount: 0
      });
      
      // Add to discovered devices but DON'T mark as visited yet
      // This allows them to be processed once
      this.discoveredDevices[dev.ipAddress] = dev;
      devicesByHop[0].push(dev);
    }
    
    // Process each hop level
    while (currentHop <= maxHops) {
      const currentDevices = devicesByHop[currentHop] || [];
      
      if (currentDevices.length === 0) {
        logger.info(`No devices to process at hop ${currentHop}, stopping BFS`);
        break;
      }
      
      logger.info(`\n=== Processing hop ${currentHop}: ${currentDevices.length} devices ===`);
      
      // Ensure next hop level list exists
      if (!devicesByHop[currentHop + 1]) {
        devicesByHop[currentHop + 1] = [];
      }
      
      // Process devices at current hop
      for (const device of currentDevices) {
        // Skip if already processed or failed
        if (device.visited || device.failed) {
          continue;
        }
        
        // Validate reachability
        const reachable = await this._validateDeviceReachability(device);
        
        if (reachable) {
          try {
            // Now proceed with discovery
            const newNeighbors = await this._discoverDevice(device, currentHop);
            
            if (newNeighbors && Array.isArray(newNeighbors) && newNeighbors.length > 0) {
              logger.info(`Device ${device.ipAddress} discovered ${newNeighbors.length} new neighbors`);
              newNeighbors.forEach(neighbor => {
                logger.info(`  - ${neighbor.ipAddress} (${neighbor.hostname || 'unknown'})`);
              });
              devicesByHop[currentHop + 1].push(...newNeighbors);
            } else {
              logger.info(`Device ${device.ipAddress} has no new neighbors to discover`);
            }
          } catch (e) {
            logger.error(`Error processing device ${device.ipAddress}: ${e.message}`);
            logger.error(e.stack);
            device.failed = true;
            device.errorMsg = e.message;
          }
          
          // Save incremental results
          this.saveToJson();
        }
        // For unreachable devices, the _validateDeviceReachability method 
        // should have already marked them as failed
      }
      
      // Report on this hop's processing
      const successful = currentDevices.filter(d => d.visited && !d.failed).length;
      const failed = currentDevices.filter(d => d.failed).length;
      const pending = currentDevices.filter(d => !d.visited && !d.failed).length;
      
      logger.info(`\n=== Hop ${currentHop} Summary ===`);
      logger.info(`  Successful: ${successful}`);
      logger.info(`  Failed: ${failed}`);
      logger.info(`  Pending: ${pending}`);
      logger.info(`  Next hop queue: ${devicesByHop[currentHop + 1].length} devices`);
      
      // ADD THIS SECTION - Check next hop before incrementing
      logger.info(`\n=== Completed hop ${currentHop} ===`);
      logger.info(`Next hop queue size: ${devicesByHop[currentHop + 1] ? devicesByHop[currentHop + 1].length : 0} devices`);
      
      // Check if next hop has devices before moving to it
      if (devicesByHop[currentHop + 1] && devicesByHop[currentHop + 1].length > 0) {
        logger.info(`Moving to hop ${currentHop + 1} with ${devicesByHop[currentHop + 1].length} devices`);
        currentHop++;
      } else {
        logger.info(`No devices in next hop queue, stopping discovery`);
        break;
      }
      // END ADDED SECTION - Don't increment currentHop unconditionally!
    }
    
    // Post-process to fill in missing data
    this._postProcessDeviceData();
    
    // Generate final report
    const total = Object.keys(this.discoveredDevices).length;
    const successful = Object.values(this.discoveredDevices).filter(d => d.visited && !d.failed).length;
    const failed = Object.values(this.discoveredDevices).filter(d => d.failed).length;
    const unreachable = Object.values(this.discoveredDevices).filter(d => d.reachabilityStatus === 'unreachable').length;
    const pending = total - successful - failed;
    
    logger.info('\n=== DISCOVERY COMPLETE ===');
    logger.info(`Total devices discovered: ${total}`);
    logger.info(`Successfully scanned: ${successful}`);
    logger.info(`Unreachable (auth failed): ${unreachable}`);
    logger.info(`Other failures: ${failed - unreachable}`);
    logger.info(`Pending scan: ${pending}`);
    
    // Protocol statistics
    const cdpDevices = Object.values(this.discoveredDevices).filter(d => 
      d.neighbors && Array.isArray(d.neighbors) && d.neighbors.some(n => n && n.discovered_via && n.discovered_via.includes('cdp'))
    ).length;
    
    const lldpDevices = Object.values(this.discoveredDevices).filter(d => 
      d.neighbors && Array.isArray(d.neighbors) && d.neighbors.some(n => n && n.discovered_via && n.discovered_via.includes('lldp'))
    ).length;
    
    logger.info(`\nProtocol Statistics:`);
    logger.info(`  Devices with CDP neighbors: ${cdpDevices}`);
    logger.info(`  Devices with LLDP neighbors: ${lldpDevices}`);
    
    logger.info(`\nResults saved to ${this.outputFile}`);
    
    this.saveToJson();
    return this.discoveredDevices;
  }

  _postProcessDeviceData() {
    logger.info('Post-processing device data...');
    
    // Build reverse mapping from neighbor data
    const ipToHostnameMap = {};
    const ipToPlatformMap = {};
    
    for (const [ip, device] of Object.entries(this.discoveredDevices)) {
      if (device.neighbors) {
        for (const neighbor of device.neighbors) {
          let neighborIp = null;
          let neighborHostname = null;
          let neighborPlatform = null;
          
          // Extract IP
          const ipFields = ['mgmt_address', 'management_ip', 'ip_address', 'neighbor_ip'];
          for (const field of ipFields) {
            if (neighbor[field]) {
              neighborIp = neighbor[field].trim();
              break;
            }
          }
          
          // Extract hostname
          const hostnameFields = ['neighbor_name', 'device_id', 'hostname', 'neighbor', 'system_name'];
          for (const field of hostnameFields) {
            if (neighbor[field]) {
              neighborHostname = neighbor[field].trim();
              break;
            }
          }
          
          // Extract platform
          if (neighbor.platform) {
            neighborPlatform = neighbor.platform;
          }
          
          if (neighborIp && neighborHostname) {
            ipToHostnameMap[neighborIp] = neighborHostname;
          }
          if (neighborIp && neighborPlatform) {
            ipToPlatformMap[neighborIp] = neighborPlatform;
          }
        }
      }
    }
    
    // Apply reverse mappings to fill in missing data
    for (const [ip, device] of Object.entries(this.discoveredDevices)) {
      if (!device.hostname && ipToHostnameMap[ip]) {
        device.hostname = ipToHostnameMap[ip];
        logger.info(`Updated hostname for ${ip} from neighbor data: ${device.hostname}`);
      }
      
      if (!device.platform && ipToPlatformMap[ip]) {
        device.platform = ipToPlatformMap[ip];
        logger.info(`Updated platform for ${ip} from neighbor data: ${device.platform}`);
      }
    }
  }

  _isValidIpAddress(ip) {
    if (!ip) return false;
    
    // Clean up the IP address by trimming whitespace and removing any non-digit or dot characters
    const cleanedIp = String(ip).trim().replace(/[^\d.]/g, '');
    
    // Check if it's a valid IPv4 format
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(cleanedIp);
  }

  saveToJson() {
    try {
      const deviceDicts = {};
      for (const [ip, device] of Object.entries(this.discoveredDevices)) {
        deviceDicts[ip] = {...device};
      }

      const topologyData = {
        devices: deviceDicts,
        metadata: {
          total_devices: Object.keys(deviceDicts).length,
          discovered_at: new Date().toISOString(),
          successful: Object.values(this.discoveredDevices).filter(d => d.visited && !d.failed).length,
          failed: Object.values(this.discoveredDevices).filter(d => d.failed).length,
          max_hop_count: Math.max(...Object.values(this.discoveredDevices).map(d => d.hopCount), 0),
          devices_with_hostname: Object.values(this.discoveredDevices).filter(d => d.hostname).length,
          devices_with_platform: Object.values(this.discoveredDevices).filter(d => d.platform).length,
          total_interfaces: Object.values(this.discoveredDevices).reduce((sum, d) => sum + (d.interfaces || []).length, 0)
        }
      };

      fs.writeFileSync(this.outputFile, JSON.stringify(topologyData, null, 2));
      logger.info(`Successfully wrote discovery results to ${this.outputFile}`);
    } catch (e) {
      logger.error(`Error saving discovery results to JSON: ${e.message}`);
      logger.error(e.stack);
    }
  }

  generateTopologyGraph() {
    const nodes = [];
    const links = [];

    // Create nodes
    for (const [ip, device] of Object.entries(this.discoveredDevices)) {
      nodes.push({
        id: ip,
        label: device.hostname || ip,
        hop: device.hopCount,
        status: device.visited && !device.failed ? 'success' : 
               device.failed ? 'failed' : 'pending',
        platform: device.platform,
        capabilities: device.capabilities,
        interfaces: device.interfaces
      });

      // Create parent-child links
      if (device.parent) {
        links.push({
          source: device.parent,
          target: ip,
          type: 'parent-child'
        });
      }
    }

    // Add neighbor links with interface information
    for (const [ip, device] of Object.entries(this.discoveredDevices)) {
      if (device.neighbors) {
        for (const neighbor of device.neighbors) {
          let neighborIp = null;
          let localInterface = null;
          let remoteInterface = null;
          
          // Extract IP and interface information
          const localInterfaceFields = ['local_interface', 'local_intf', 'interface', 'port', 'local_port'];
          const remoteInterfaceFields = ['remote_interface', 'remote_intf', 'neighbor_interface', 'port_id', 'remote_port'];
          
          // Find IP
            const ipFields = ['mgmt_address', 'management_ip', 'ip_address', 'neighbor_ip', 
                'MGMT_ADDRESS', 'IP_ADDRESS', 'NEIGHBOR_IP'];
            for (const field of ipFields) {
            if (neighbor[field]) {
            neighborIp = neighbor[field].trim();
            break;
            }
            }
          
          // Find interfaces
          for (const field of localInterfaceFields) {
            if (neighbor[field]) {
              localInterface = neighbor[field];
              break;
            }
          }
          
          for (const field of remoteInterfaceFields) {
            if (neighbor[field]) {
              remoteInterface = neighbor[field];
              break;
            }
          }

          if (neighborIp && this.discoveredDevices[neighborIp]) {
            // Check if link already exists
            const linkExists = links.some(link => 
              (link.source === ip && link.target === neighborIp) ||
              (link.source === neighborIp && link.target === ip)
            );

            if (!linkExists) {
              links.push({
                source: ip,
                target: neighborIp,
                type: neighbor.discovered_via ? neighbor.discovered_via.split(' ')[1] : 'unknown',
                sourceInterface: localInterface,
                targetInterface: remoteInterface
              });
            }
          }
        }
      }
    }

    return { nodes, links };
  }
}


async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  let exclusions = '';
  let maxHops = 4;
  const seedDevices = [];
  let credsFile = 'creds.json'; // Default creds file name
  
  // Display help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Network Discovery Tool - Command Line Options:
  --exclude PATTERN[,PATTERN...]  Exclude devices matching these patterns
  --seed HOST,IP[;HOST,IP...]     Specify seed device(s) for discovery (semicolon separated)
                                  Single IP format also accepted (hostname will be derived)
  --max-hops NUMBER               Maximum hop count for discovery (default: 4)
  --creds-file FILENAME           JSON file containing credentials (default: creds.json)
  --help, -h                      Display this help message
    
Example: 
  node discovery.js --seed switch1,10.0.0.1;router1,10.0.0.2 --exclude core,backup --max-hops 3 --creds-file my-creds.json
  node discovery.js --seed 10.0.0.1 --exclude backup --max-hops 2
    `);
    return;
  }
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--exclude' && i + 1 < args.length) {
      exclusions = args[i + 1];
      i++;
    } else if (args[i] === '--seed' && i + 1 < args.length) {
      // Support for both seed formats - single IP or hostname,ip pairs
      const seedsArray = args[i + 1].split(';');
      
      for (const seedInput of seedsArray) {
        // Check if input contains a comma (hostname,ip format)
        if (seedInput.includes(',')) {
          const seedParts = seedInput.split(',');
          if (seedParts.length === 2) {
            seedDevices.push({
              hostname: seedParts[0].trim(),
              ip_address: seedParts[1].trim()
            });
          } else {
            console.error(`Error: Invalid seed format: ${seedInput}. Must be hostname,ip_address or just ip_address`);
            return; // Exit if invalid format
          }
        } else {
          // If no comma, treat as single IP address and leave hostname blank
          // The system will attempt to get hostname during discovery
          const ipAddress = seedInput.trim();
          seedDevices.push({
            hostname: '',  // Empty hostname
            ip_address: ipAddress
          });
          console.log(`Added seed device with IP: ${ipAddress} (hostname will be determined during discovery)`);
        }
      }
      i++;
    } else if (args[i] === '--max-hops' && i + 1 < args.length) {
      maxHops = parseInt(args[i + 1]);
      if (isNaN(maxHops)) {
        console.error(`Error: Invalid max-hops value: ${args[i + 1]}. Must be a number.`);
        return; // Exit if invalid
      }
      i++;
    } else if ((args[i] === '--creds-file' || args[i] === '--creds') && i + 1 < args.length) {
      credsFile = args[i + 1];
      i++;
    }
  }
  
  // Validate that we have seed devices
  if (seedDevices.length === 0) {
    console.error('Error: No seed devices specified. Use --seed option to specify at least one seed device.');
    console.log('Run with --help for usage information.');
    return; // Exit if no seeds
  }
  
  // Load credentials from file
  let credentials = [];
  try {
    if (fs.existsSync(credsFile)) {
      const credsData = fs.readFileSync(credsFile, 'utf8');
      const credsJson = JSON.parse(credsData);
      
      if (Array.isArray(credsJson)) {
        credentials = credsJson.map(cred => new Credential(cred));
        console.log(`Loaded ${credentials.length} credentials from ${credsFile}`);
      } else {
        console.error(`Error: Credentials file must contain an array of credential objects`);
        return; // Exit on invalid creds file
      }
    } else {
      console.error(`Error: Credentials file ${credsFile} not found.`);
      return; // Exit if creds file not found
    }
  } catch (error) {
    console.error(`Error loading credentials from ${credsFile}: ${error.message}`);
    return; // Exit on creds loading error
  }
  
  if (credentials.length === 0) {
    console.error('Error: No valid credentials found.');
    return; // Exit if no valid credentials
  }
  
  // Log the settings
  console.log(`Starting discovery with ${seedDevices.length} seed device(s):`);
  seedDevices.forEach(device => {
    console.log(`  - ${device.hostname || '[Hostname pending]'} (${device.ip_address})`);
  });
  console.log(`Using ${credentials.length} credential(s)`);
  console.log(`Maximum hop count: ${maxHops}`);
  if (exclusions) {
    console.log(`Exclusion patterns: ${exclusions}`);
  }

  // Initialize discovery
  const discovery = new NetworkDiscovery(credentials, {
    maxThreads: 1,
    outputFile: 'network_topology.json',
    exclusions: exclusions
  });

  // Add custom regex templates if needed
  discovery.parser.addTemplate(
    ParseMethod.REGEX,
    'hostname\\s+(?<hostname>\\S+)',
    0,
    'hostname_regex'
  );

  // Run discovery with the seed devices
  const discovered = await discovery.discoverSingleThreaded(seedDevices, maxHops);

  // Print summary
  console.log(`\nDiscovered ${Object.keys(discovered).length} devices`);
  const successful = Object.values(discovered).filter(d => d.visited && !d.failed).length;
  const failed = Object.values(discovered).filter(d => d.failed).length;
  console.log(`Successfully scanned: ${successful}`);
  console.log(`Failed to scan: ${failed}`);
  console.log(`\nResults saved to: ${discovery.outputFile}`);

  // Generate topology graph
  const graphData = discovery.generateTopologyGraph();
  fs.writeFileSync('network_topology_graph.json', JSON.stringify(graphData, null, 2));
  console.log('Topology graph data saved to: network_topology_graph.json');
  console.log("DISCOVERY_COMPLETE:SUCCESS");

  process.exit(0);
}
module.exports = { NetworkDiscovery, DiscoveredDevice, Credential, ExtensibleParser, ParseMethod };

if (require.main === module) {
  main().catch(console.error);
}   