#!/usr/bin/env node

// Import your existing SSH client module
const { SynchronousSSHClient, SSHClientOptions } = require('./ssh-client2');
const fs = require('fs');

// Test configuration
const config = {
  host: '172.16.101.100',  // Your Arista switch
  port: 22,
  username: 'cisco',     // Update with your actual username
  password: 'cisco',  // Update with your actual password
  logFile: 'connection.log',
  debug: true
};

async function connectToArista() {
  console.log(`Testing connection to Arista switch at ${config.host}:${config.port}`);
  
  // Create enhanced options for Arista compatibility
  const sshOptions = new SSHClientOptions({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    logFile: config.logFile,
    debug: config.debug,
    timeout: 30,  // Increase timeout for negotiation
  });
  
  // Create client with our enhanced options
  const client = new SynchronousSSHClient(sshOptions);
  
  // Override the connection options before connecting
  const originalConnect = client.connect;
  client.connect = function() {
    // Set up the connect function
    return new Promise((resolve, reject) => {
      this._log(`Connecting to Arista switch at ${this._options.host}:${this._options.port}...`, true);
      
      // Create the client
      const { Client } = require('ssh2');
      this._sshClient = new Client();
      
      // Add normal event handlers
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
      
      // Standard keyboard-interactive handler
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
      
      // Add other event handlers
      this._sshClient.on('timeout', () => {
        this._log('Connection timeout!', true);
        reject(new Error('Connection timeout'));
      });
      
      this._sshClient.on('close', () => {
        this._log('Connection closed', true);
      });
      
      this._sshClient.on('end', () => {
        this._log('Connection ended', true);
      });
      
      // Specific configuration for Arista switches - using the algorithms we found
      const aristaConnectionOptions = {
        host: this._options.host,
        port: this._options.port,
        username: this._options.username,
        password: this._options.password,
        tryKeyboard: true,
        readyTimeout: this._options.timeout * 1000,
        debug: this._options.debug,
        // Using algorithms known to be supported by this Arista switch
        algorithms: {
          kex: [
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group14-sha256',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521'
          ],
          cipher: [
            'aes128-cbc',
            'aes192-cbc',
            'aes256-cbc',
            '3des-cbc',

            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr'
          ],
          serverHostKey: [
            'ssh-rsa',
            'ssh-dss',
            'rsa-sha2-256',
            'rsa-sha2-512'
          ],
          hmac: [
            'hmac-md5',
            'hmac-md5-96',
            'hmac-sha1',
            'hmac-sha1-96',
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-ripemd160',
          ],
          compress: ['none', 'zlib@openssh.com', 'zlib']
        }
      };
      
      // Log connection options if debug is enabled
      if (this._options.debug) {
        this._log(`Arista Connection options: ${JSON.stringify(aristaConnectionOptions, null, 2)}`);
      }
      
      // Connect with our modified options
      this._sshClient.connect(aristaConnectionOptions);
    });
  };
  
  try {
    console.log("Connecting to device...");
    await client.connect();
    
    // After connection, test with a simple command
    console.log("Running 'show version' command...");
    const output = await client.execute('show version');
    
    console.log("\n=== Command Output ===");
    console.log(output);
    console.log("=====================\n");
    
    // Disconnect
    client.disconnect();
    console.log("Test completed successfully");
    
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
    
    // Make sure to disconnect if there was an error
    if (client._connected) {
      client.disconnect();
    }
  }
}

// Run the test
connectToArista().catch(err => {
  console.error(`Fatal error: ${err.message}`);
});