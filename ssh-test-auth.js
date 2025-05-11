#!/usr/bin/env node

// Import the SSH client modules
const { SynchronousSSHClient, SSHClientOptions } = require('./ssh-client2-cisco.js');
const fs = require('fs');

// Configuration
const config = {
  host: '172.16.101.100',
  port: 22,
  username: 'cisco',
  password: 'cisco',
  debug: true,
  logFile: 'auth-debug.log'
};

// Add custom debugging for authentication
async function testAuthentication() {
  console.log(`=== Testing Authentication for ${config.host} ===`);
  
  // Create options with verbose debugging
  const sshOptions = new SSHClientOptions({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    debug: config.debug,
    logFile: config.logFile,
    timeout: 30
  });
  
  // Create client
  const client = new SynchronousSSHClient(sshOptions);
  
  // Add custom authentication debugging
  const originalOnKeyboardInteractive = client._setupSSHEventHandlers;
  client._setupSSHEventHandlers = function(resolve, reject) {
    originalOnKeyboardInteractive.call(this, resolve, reject);
    
    // Add detailed keyboard-interactive handler logging
    this._sshClient.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
      this._log(`AUTH DEBUG: Keyboard-interactive authentication requested`, true);
      this._log(`AUTH DEBUG: Name: "${name}"`, true);
      this._log(`AUTH DEBUG: Instructions: "${instructions}"`, true);
      this._log(`AUTH DEBUG: InstructionsLang: "${instructionsLang}"`, true);
      this._log(`AUTH DEBUG: Prompts count: ${prompts.length}`, true);
      
      prompts.forEach((prompt, i) => {
        this._log(`AUTH DEBUG: Prompt ${i}: "${prompt.prompt}" (echo: ${prompt.echo})`, true);
      });
      
      // Create responses
      const responses = [];
      if (prompts.length > 0) {
        for (let i = 0; i < prompts.length; i++) {
          this._log(`AUTH DEBUG: Sending password for prompt ${i}`, true);
          responses.push(this._options.password);
        }
      } else {
        this._log(`AUTH DEBUG: No prompts received, sending empty responses array`, true);
      }
      
      this._log(`AUTH DEBUG: Sending ${responses.length} responses`, true);
      finish(responses);
    });
  };
  
  try {
    console.log("Starting connection...");
    await client.connect();
    
    console.log("\n=== Authentication Successful! ===");
    console.log("Attempting to run a simple command...");
    
    try {
      const output = await client.execute('show version');
      console.log("Command succeeded! First 100 characters of output:");
      console.log(output.substring(0, 100) + "...");
    } catch (cmdError) {
      console.error(`Command execution failed: ${cmdError.message}`);
    }
    
    // Disconnect
    client.disconnect();
    console.log("Test completed and connection closed");
    
  } catch (error) {
    console.error(`\n=== Authentication Failed ===`);
    console.error(`Error: ${error.message}`);
    
    // Try to get more detailed error info
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    
    // Suggest possible fixes
    console.log("\nPossible solutions:");
    console.log("1. Check if username/password is correct");
    console.log("2. Verify SSH service is enabled on the device");
    console.log("3. Check if the device supports keyboard-interactive authentication");
    console.log("4. Try different authentication methods (password, public key)");
    console.log("5. Verify SSH version compatibility");
    
    // Make sure to disconnect if there was an error
    if (client._connected) {
      client.disconnect();
    }
  }
}

// Run the test
console.log(`Testing authentication with username "${config.username}" and password "${config.password}"`);
testAuthentication().catch(err => {
  console.error(`Fatal error: ${err.message}`);
});