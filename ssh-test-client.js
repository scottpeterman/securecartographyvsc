#!/usr/bin/env node

// Import the SSH client modules from your library
const { SynchronousSSHClient, SSHClientOptions } = require('./ssh-client2-cisco.js');
const fs = require('fs');
const path = require('path');

// Log file setup
const logFile = path.join(__dirname, 'ssh-test.log');
fs.writeFileSync(logFile, `SSH Test Started: ${new Date().toISOString()}\n`);

// Device configurations - you can add multiple devices to test against
const devices = [
  {
    name: 'testswitch1',
    host: '10.42.42.59',
    port: 22,
    username: 'el-speterman',
    password: 'Hemingway@2024',
    // type: 'cisco-ios'
  }
  // You can add more devices here
  // {
  //   name: 'Arista Switch',
  //   host: '192.168.1.2',
  //   port: 22,
  //   username: 'admin',
  //   password: 'password',
  //   type: 'arista'
  // }
];

// Test commands for different device types
const testCommands = {
  'cisco-ios': [
    'show version',
    'show ip interface brief',
    'show running-config | include hostname'
  ],
  'arista': [
    'show version',
    'show interfaces status',
    'show running-config | include hostname'
  ]
};

// Custom output handler to both console log and append to file
function outputHandler(message) {
  console.log(message);
  fs.appendFileSync(logFile, `${message}\n`);
}

// Custom error handler
function errorHandler(message) {
  console.error(`ERROR: ${message}`);
  fs.appendFileSync(logFile, `ERROR: ${message}\n`);
}

// Test connecting to a device and running commands
async function testDeviceConnection(device) {
  outputHandler(`\n===============================================`);
  outputHandler(`Testing connection to ${device.name} (${device.host})`);
  outputHandler(`===============================================\n`);
  
  // Create SSH client options
  const sshOptions = new SSHClientOptions({
    host: device.host,
    port: device.port,
    username: device.username,
    password: device.password,
    logFile: logFile,
    debug: true,
    timeout: 30,
    outputCallback: outputHandler,
    errorCallback: errorHandler
  });
  
  // Create client instance
  const client = new SynchronousSSHClient(sshOptions);
  
  try {
    // Connect to device
    outputHandler(`Attempting to connect to ${device.host}...`);
    await client.connect();
    outputHandler(`Successfully connected to ${device.host}`);
    
    // Get connection info if available
    try {
      const connInfo = client.getConnectionInfo();
      outputHandler(`Connection info: ${JSON.stringify(connInfo, null, 2)}`);
    } catch (error) {
      errorHandler(`Could not retrieve connection info: ${error.message}`);
    }
    
    // Run test commands for this device type
    const commands = testCommands[device.type] || [];
    if (commands.length > 0) {
      outputHandler(`\nExecuting test commands:`);
      
      for (const command of commands) {
        outputHandler(`\n>>> Executing command: ${command}`);
        
        try {
          const output = await client.execute(command);
          outputHandler(`Command output:\n${output}`);
        } catch (error) {
          errorHandler(`Command execution failed: ${error.message}`);
        }
      }
    }
    
    // Test shell mode if you want to try that
    outputHandler(`\n>>> Testing shell mode interaction`);
    try {
      // Enable shell mode
      client._options.invokeShell = true;
      
      // Create shell
      await client.createShell();
      outputHandler(`Shell created successfully`);
      
      // Try to detect the prompt automatically
      outputHandler(`Sending empty command to detect prompt...`);
      client.sendCommand('');
      
      // Wait for a response and look for common prompts
      try {
        const result = await client.expect(['>', '#', '$'], 5000);
        const detectedPrompt = result.pattern;
        outputHandler(`Detected prompt: ${detectedPrompt}`);
        
        // Now try a command with the detected prompt
        outputHandler(`\n>>> Running command in shell mode with detected prompt`);
        const output = await client.executeShellCommand('terminal length 0', detectedPrompt);
        outputHandler(`Shell command output:\n${output}`);
      } catch (error) {
        errorHandler(`Could not detect prompt: ${error.message}`);
      }
    } catch (error) {
      errorHandler(`Shell mode test failed: ${error.message}`);
    }
    
    // Disconnect
    outputHandler(`\nDisconnecting from ${device.host}`);
    client.disconnect();
    outputHandler(`Successfully disconnected`);
    
    return true;
  } catch (error) {
    errorHandler(`Connection test failed: ${error.message}`);
    
    // Make sure to disconnect if there was an error
    if (client._connected) {
      try {
        client.disconnect();
        outputHandler(`Disconnected after error`);
      } catch (disconnectError) {
        errorHandler(`Error during disconnect: ${disconnectError.message}`);
      }
    }
    
    return false;
  }
}

// Main function to run all tests
async function runAllTests() {
  outputHandler(`SSH Client Library Test`);
  outputHandler(`Started at: ${new Date().toISOString()}`);
  outputHandler(`Testing ${devices.length} devices\n`);
  
  let successCount = 0;
  
  for (const device of devices) {
    const success = await testDeviceConnection(device);
    if (success) {
      successCount++;
    }
  }
  
  outputHandler(`\n===============================================`);
  outputHandler(`Test Summary: ${successCount}/${devices.length} devices tested successfully`);
  outputHandler(`Completed at: ${new Date().toISOString()}`);
  outputHandler(`Log file: ${logFile}`);
  outputHandler(`===============================================\n`);
}

// Run the tests
runAllTests().catch(error => {
  errorHandler(`Fatal error in test runner: ${error.message}`);
  process.exit(1);
});