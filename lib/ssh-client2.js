#!/usr/bin/env node

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const { EventEmitter } = require('events');

class SSHClientOptions {
  constructor(options = {}) {
    this.host = options.host || '';
    this.port = options.port || 22;
    this.username = options.username || '';
    this.password = options.password || '';
    this.invokeShell = options.invokeShell || false;
    this.expectPrompt = options.expectPrompt || null;
    this.prompt = options.prompt || null;
    this.promptCount = options.promptCount || 1;
    this.timeout = options.timeout || 15;
    this.shellTimeout = options.shellTimeout || 5;
    this.interCommandTime = options.interCommandTime || 1;
    this.logFile = options.logFile || null;
    this.debug = options.debug || false;
    this.expectPromptTimeout = options.expectPromptTimeout || 30000;

    // Default callbacks
    this.outputCallback = options.outputCallback || console.log;
    this.errorCallback = options.errorCallback || ((msg) => console.error(`ERROR: ${msg}`));
  }
}

class SynchronousSSHClient extends EventEmitter {
  constructor(options) {
    super();
    this._options = options;
    this._sshClient = null;
    this._shell = null;
    this._outputBuffer = '';
    this._connected = false;
    this._shellReady = false;
    this._lineBuffer = ''; // Buffer for accumulating output until newline
    this._negotiatedAlgorithms = null; // Store the negotiated algorithms

    // Validate required options
    if (!options.host) throw new Error('Host is required');
    if (!options.username) throw new Error('Username is required');
    if (!options.password) throw new Error('Password is required');
  }

  _log(message, alwaysPrint = false) {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
    const timestampedMessage = `[${timestamp}] ${message}`;

    if (this._options.debug || alwaysPrint) {
      console.log(timestampedMessage);
    }

    if (this._options.logFile) {
      try {
        fs.appendFileSync(this._options.logFile, timestampedMessage + '\n');
      } catch (error) {
        this._options.errorCallback(`Error writing to log file: ${error.message}`);
      }
    }
  }

  // Connect with a comprehensive set of algorithms and let SSH negotiate
  connect() {
    this._log(`Connecting to ${this._options.host}:${this._options.port}...`, true);
    
    return new Promise((resolve, reject) => {
      this._sshClient = new Client();
      
      // Set up all event handlers
      this._setupSSHEventHandlers(resolve, reject);
      
      // Comprehensive algorithm set covering all device types
      const comprehensiveOptions = {
        host: this._options.host,
        port: this._options.port,
        username: this._options.username,
        password: this._options.password,
        tryKeyboard: true,  // Enable keyboard-interactive auth
        readyTimeout: this._options.timeout * 1000,
        debug: this._options.debug,
        // Include all supported algorithms across devices
        algorithms: {
          kex: [
            // Modern/Arista
            'curve25519-sha256',
            'curve25519-sha256@libssh.org', 
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group16-sha512',
            // Legacy
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group-exchange-sha1'
          ],
          cipher: [
            // Modern
            'aes128-gcm@openssh.com',
            'aes256-gcm@openssh.com',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            // Legacy
            'aes128-cbc',
            'aes192-cbc',
            'aes256-cbc',
            '3des-cbc'
          ],
          serverHostKey: [
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
            'ecdsa-sha2-nistp256',
            'ssh-ed25519'
          ],
          hmac: [
            // Modern ETM
            'hmac-sha2-256-etm@openssh.com',
            'hmac-sha2-512-etm@openssh.com',
            // Standard
            'hmac-sha2-256',
            'hmac-sha2-512',
            // Legacy
            'hmac-sha1',
            'hmac-md5'
          ],
          compress: ['none', 'zlib@openssh.com', 'zlib']
        }
      };
      
      if (this._options.debug) {
        this._log(`Connection options: ${JSON.stringify(comprehensiveOptions, null, 2)}`);
      }
      
      // Connect with the comprehensive options
      this._sshClient.connect(comprehensiveOptions);
    });
  }

    async findPrompt(outputBuffer, attemptCount = 3, timeout = 5000) {
    if (!this._shellReady) {
      throw new Error('Shell not initialized');
    }
    
    this._log('Attempting to auto-detect command prompt pattern...', true);
    
    // Common prompt patterns to look for
    const commonPromptPatterns = [
      /(\S+)[#>]\s*$/,         // Standard CLI prompts like 'router#' or 'switch>'
      /(\S+)[$#>%]\s*$/,       // Linux/Unix style prompts
      /^\s*(\S+[@:]\S+)[#$>]\s*$/m,  // username@host style prompts
      /^([A-Za-z0-9_\-]+\s*[#>:])\s*$/m,  // Simple hostname followed by delimiter
      /^\s*([A-Za-z0-9_\-.]+(?:@[A-Za-z0-9_\-.]+)?[#$>%])\s*$/m // More flexible hostname/username@hostname pattern
    ];
    
    // If we already have content in the buffer, try to match it
    if (outputBuffer && outputBuffer.length > 0) {
      for (const pattern of commonPromptPatterns) {
        const match = outputBuffer.match(pattern);
        if (match) {
          const detectedPrompt = match[0];
          this._log(`Prompt detected from initial output: "${detectedPrompt}"`, true);
          return detectedPrompt;
        }
      }
    }
    
    // If no prompt found in initial buffer, try sending empty commands
    // to trigger the prompt to appear
    for (let i = 0; i < attemptCount; i++) {
      this._log(`Sending empty command to trigger prompt (attempt ${i+1}/${attemptCount})`);
      this._shell.write('\n');
      
      // Wait for some output
      try {
        const output = await new Promise((resolve, reject) => {
          let buffer = '';
          const dataHandler = (data) => {
            buffer += data.toString();
            // Check if any of our patterns match
            for (const pattern of commonPromptPatterns) {
              const match = buffer.match(pattern);
              if (match) {
                this.removeListener('data', dataHandler);
                resolve({ match, buffer });
                return;
              }
            }
          };
          
          // Set timeout
          const timeoutId = setTimeout(() => {
            this.removeListener('data', dataHandler);
            reject(new Error(`Timeout waiting for prompt pattern on attempt ${i+1}`));
          }, timeout);
          
          // Listen for data
          this.on('data', dataHandler);
        });
        
        if (output && output.match) {
          const detectedPrompt = output.match[0];
          this._log(`Prompt detected: "${detectedPrompt}"`, true);
          return detectedPrompt;
        }
      } catch (error) {
        this._log(`Error in prompt detection attempt ${i+1}: ${error.message}`);
        // Continue to next attempt
      }
    }
    
    // If we get here, we couldn't detect the prompt
    this._log('Could not auto-detect prompt pattern', true);
    throw new Error('Failed to auto-detect command prompt pattern');
  }
  // Helper method to set up SSH event handlers
  _setupSSHEventHandlers(resolve, reject) {
    if (this._options.debug) {
      this._sshClient.on('debug', (info) => {
        this._log(`SSH Debug: ${info}`);
      });
    }
    
    this._sshClient.on('ready', () => {
      this._log(`Connected to ${this._options.host}:${this._options.port}`, true);
      this._connected = true;
      resolve();
    });
    
    this._sshClient.on('error', (error) => {
      this._log(`Connection error: ${error.message}`, true);
      reject(error);
    });
    
    // Handle keyboard-interactive authentication
    this._sshClient.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
      this._log('Keyboard-interactive authentication requested', true);
      
      // Create responses array
      const responses = [];
      for (let i = 0; i < prompts.length; i++) {
        this._log(`Prompt ${i}: "${prompts[i].prompt}" (echo: ${prompts[i].echo})`);
        responses.push(this._options.password);
      }
      
      this._log(`Sending ${responses.length} responses`);
      finish(responses);
    });
    
    // Handle handshake completion (if supported by the ssh2 library)
    if (this._sshClient.on && typeof this._sshClient.on === 'function') {
      try {
        this._sshClient.on('handshake', (negotiated) => {
          this._negotiatedAlgorithms = negotiated;
          this._log(`Handshake complete. Negotiated algorithms: ${JSON.stringify(negotiated, null, 2)}`, true);
        });
      } catch (e) {
        this._log('Handshake event not supported by this version of ssh2', true);
      }
    }
    
    // Add timeout event
    this._sshClient.on('timeout', () => {
      this._log('Connection timeout!', true);
      reject(new Error('Connection timeout'));
    });
    
    // Add close event
    this._sshClient.on('close', () => {
      this._log('Connection closed', true);
    });
    
    // Add end event
    this._sshClient.on('end', () => {
      this._log('Connection ended', true);
    });
  }

  createShell() {
    if (!this._connected) {
      throw new Error('Not connected to SSH server');
    }

    return new Promise((resolve, reject) => {
      this._sshClient.shell({ term: 'vt100', rows: 24, cols: 80 }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        this._shell = stream;
        this._shellReady = true;
        
        // Set up data handler for the shell
        this._shell.on('data', (data) => {
          const dataStr = data.toString();
          this._outputBuffer += dataStr;
          
          // Buffer the output and only display complete lines
          this._lineBuffer += dataStr;
          
          // Check for complete lines
          const lines = this._lineBuffer.split('\n');
          
          // Process all complete lines (all but the last element)
          for (let i = 0; i < lines.length - 1; i++) {
            this._options.outputCallback(lines[i]);
          }
          
          // Keep the incomplete line in the buffer
          this._lineBuffer = lines[lines.length - 1];
          
          // Always emit the raw data for event listeners
          this.emit('data', dataStr);
        });

        resolve();
      });
    });
  }

  // Synchronous-style command execution for shell mode
  sendCommand(command) {
    if (!this._shellReady) {
      throw new Error('Shell not initialized');
    }

    this._log(`Sending command: '${command}'`);
    this._shell.write(command + '\n');
  }

  // Wait for specific text pattern in output
  waitFor(pattern, timeout = 30000) {
    if (!this._shellReady) {
      throw new Error('Shell not initialized');
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let buffer = '';

      const checkPattern = (data) => {
        buffer += data;
        
        if (buffer.includes(pattern)) {
          this.removeListener('data', checkPattern);
          resolve(buffer);
        } else if (Date.now() - startTime > timeout) {
          this.removeListener('data', checkPattern);
          reject(new Error(`Timeout waiting for pattern: ${pattern}`));
        }
      };

      this.on('data', checkPattern);
    });
  }

  // Send command and wait for prompt
  async executeShellCommand(command, expectedPrompt = null) {
    if (!this._shellReady) {
      await this.createShell();
    }

    const prompt = expectedPrompt || this._options.expectPrompt || this._options.prompt;
    if (!prompt) {
      throw new Error('No prompt pattern defined for shell execution');
    }

    this.sendCommand(command);
    
    try {
      const output = await this.waitFor(prompt, this._options.expectPromptTimeout);
      return output;
    } catch (error) {
      this._log(`Error waiting for prompt: ${error.message}`, true);
      throw error;
    }
  }

  // Execute command directly (non-shell mode)
  executeDirectCommand(command) {
    if (!this._connected) {
      throw new Error('Not connected to SSH server');
    }

    return new Promise((resolve, reject) => {
      this._sshClient.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        let error = '';
        let outputLineBuffer = '';
        let errorLineBuffer = '';

        stream.on('data', (data) => {
          const dataStr = data.toString();
          output += dataStr;
          
          // Buffer the output and only display complete lines
          outputLineBuffer += dataStr;
          const lines = outputLineBuffer.split('\n');
          
          for (let i = 0; i < lines.length - 1; i++) {
            this._options.outputCallback(lines[i]);
          }
          
          outputLineBuffer = lines[lines.length - 1];
        });

        stream.stderr.on('data', (data) => {
          const dataStr = data.toString();
          error += dataStr;
          
          // Buffer the error output and only display complete lines
          errorLineBuffer += dataStr;
          const lines = errorLineBuffer.split('\n');
          
          for (let i = 0; i < lines.length - 1; i++) {
            this._options.errorCallback(lines[i]);
          }
          
          errorLineBuffer = lines[lines.length - 1];
        });

        stream.on('close', () => {
          // Output any remaining content in the buffers
          if (outputLineBuffer) {
            this._options.outputCallback(outputLineBuffer);
          }
          if (errorLineBuffer) {
            this._options.errorCallback(errorLineBuffer);
          }
          
          if (error) {
            reject(new Error(error));
          } else {
            resolve(output);
          }
        });
      });
    });
  }

  // High-level command execution method
  async execute(command) {
    if (this._options.invokeShell) {
      // For shell mode, break command into individual commands
      const commands = command.split(',').map(cmd => cmd.trim()).filter(cmd => cmd);
      let output = '';

      for (const cmd of commands) {
        const result = await this.executeShellCommand(cmd);
        output += result;

        // Wait between commands if specified
        if (this._options.interCommandTime > 0) {
          await new Promise(resolve => 
            setTimeout(resolve, this._options.interCommandTime * 1000)
          );
        }
      }

      return output;
    } else {
      // Direct execution mode
      return this.executeDirectCommand(command);
    }
  }

  disconnect() {
    this._log('Disconnecting from device');
    
    // Output any remaining content in the line buffer
    if (this._lineBuffer) {
      this._options.outputCallback(this._lineBuffer);
      this._lineBuffer = '';
    }
    
    if (this._shell) {
      this._shell.end();
      this._shell = null;
      this._shellReady = false;
    }
    
    if (this._sshClient) {
      this._sshClient.end();
      this._connected = false;
    }
    
    this._log('Successfully disconnected');
  }

  // Utility method for expect-style programming
  async expect(patterns, timeout = 30000) {
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let buffer = '';

      const checkPatterns = (data) => {
        buffer += data;
        
        for (let i = 0; i < patterns.length; i++) {
          if (buffer.includes(patterns[i])) {
            this.removeListener('data', checkPatterns);
            resolve({ matched: i, pattern: patterns[i], buffer });
            return;
          }
        }
        
        if (Date.now() - startTime > timeout) {
          this.removeListener('data', checkPatterns);
          reject(new Error(`Timeout waiting for patterns: ${patterns.join(', ')}`));
        }
      };

      this.on('data', checkPatterns);
    });
  }
  
  // Get information about the negotiated connection
  getConnectionInfo() {
    if (!this._connected) {
      throw new Error('Not connected to SSH server');
    }
    
    return {
      host: this._options.host,
      port: this._options.port,
      connected: this._connected,
      negotiatedAlgorithms: this._negotiatedAlgorithms
    };
  }
}

// Example usage for expect-style programming
class ExpectStyleSSHSession {
  constructor(options) {
    this.client = new SynchronousSSHClient(options);
  }

  async connect() {
    await this.client.connect();
    await this.client.createShell();
  }

  async login() {
    // Wait for login prompt
    await this.client.waitFor('login:', 10000);
    this.client.sendCommand(this.client._options.username);
    
    // Wait for password prompt
    await this.client.waitFor('password:', 10000);
    this.client.sendCommand(this.client._options.password);
    
    // Wait for shell prompt
    await this.client.waitFor('$', 10000);
  }

  async runCommand(command) {
    this.client.sendCommand(command);
    const result = await this.client.expect(['$', '#'], 30000);
    return result.buffer;
  }

  disconnect() {
    this.client.disconnect();
  }
}

// CLI interface for direct command line usage
class SPN {
  static VERSION = '1.0.0';
  static COPYRIGHT = 'Copyright (C) 2025 SSHPassJavascript';

  constructor() {
    // If running from command line, parse arguments
    if (require.main === module) {
      this.parseArguments();
    }
  }

  parseArguments() {
    // In a real implementation, you'd use a CLI package like commander
    // This is a simplified version
    const args = process.argv.slice(2);
    // ... parse arguments logic ...
  }

  // ... other CLI methods ...
}

// Export everything we need
module.exports = { 
  SPN, 
  SynchronousSSHClient, 
  SSHClientOptions,
  ExpectStyleSSHSession 
};