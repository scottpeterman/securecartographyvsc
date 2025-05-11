# Path Management in VS Code Extensions

This document outlines best practices for managing file paths in VS Code extensions, addressing the unique challenges that arise during development, debugging, and after packaging/deployment.

## Table of Contents

- [Core Challenges](#core-challenges)
- [Types of Paths](#types-of-paths)
- [Best Practices](#best-practices)
  - [Extension Resource Paths](#extension-resource-paths)
  - [User Data Paths](#user-data-paths)
  - [Temporary Files](#temporary-files)
- [Debugging Considerations](#debugging-considerations)
- [Extension Packaging Considerations](#extension-packaging-considerations)
- [Managing External Command Execution](#managing-external-command-execution)
- [Implementation Examples](#implementation-examples)
- [Common Pitfalls](#common-pitfalls)

## Core Challenges

VS Code extensions face unique file path challenges:

1. **Execution Context Changes**: The working directory varies between development, debugging, and production
2. **Extension Packaging**: After packaging, your extension structure might differ from development
3. **Multiple Operating Systems**: Paths must work across Windows, macOS, and Linux
4. **User-Generated Files**: Output files need appropriate, accessible locations
5. **Extension Isolation**: Your extension should not conflict with other extensions

## Types of Paths

Understanding the different types of paths is crucial:

### 1. Extension Resource Paths
- Templates, configuration files, and resources bundled with your extension
- Examples: Templates directory, library files, UI resources
- These must be accessible from the extension's installed location

### 2. User Data Paths
- Files created or modified by the user through your extension
- Examples: Output files, saved configurations, logs
- These should be in user-accessible locations

### 3. Temporary Paths
- Files created temporarily during extension operation
- Examples: Intermediate processing files, temporary outputs
- These should be in standard temp directories

## Best Practices

### Extension Resource Paths

1. **Always use `context.extensionPath` or `context.extensionUri`**:
```javascript
// DON'T
const templatePath = './templates/textfsm';
// or
const templatePath = path.join(__dirname, 'templates/textfsm');

// DO
const templatePath = path.join(context.extensionPath, 'templates/textfsm');
// or with URI (better for VS Code APIs)
const templateUri = vscode.Uri.joinPath(context.extensionUri, 'templates', 'textfsm');
```

2. **For webview resources, use the webview's URI conversion**:
```javascript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'webview', 'main.js')
);
```

3. **Pass fully resolved paths to subsystems rather than relying on environment variables**:
```javascript
// DON'T
process.env.NET_TEXTFSM = path.join(context.extensionPath, 'templates/textfsm');
myLibrary.doSomething(); // Internally uses process.env.NET_TEXTFSM

// DO
const templatePath = path.join(context.extensionPath, 'templates/textfsm');
myLibrary.doSomething(templatePath); // Explicitly pass the path
```

4. **For modules inside your extension, either bundle or use context-based paths**:
```javascript
// If not bundling with webpack/esbuild:
const myModulePath = path.join(context.extensionPath, 'lib', 'my-module.js');
const myModule = require(myModulePath);
```

5. **Make paths OS-independent by using `path.join`**:
```javascript
// DON'T
const templatePath = context.extensionPath + '/templates/textfsm';

// DO
const templatePath = path.join(context.extensionPath, 'templates', 'textfsm');
```

### User Data Paths

1. **Use VS Code's storage locations for extension-specific data**:
```javascript
// Global storage (across workspaces)
const storageUri = context.globalStorageUri;
const outputDir = path.join(storageUri.fsPath, 'outputs');

// Workspace storage (specific to current workspace)
const workspaceStorageUri = context.storageUri;
const workspaceOutputDir = workspaceStorageUri ? 
  path.join(workspaceStorageUri.fsPath, 'outputs') : null;
```

2. **Let users choose output locations with sensible defaults**:
```javascript
// Default to user's home directory or documents folder
const defaultOutputPath = path.join(os.homedir(), 'vscode-extension-outputs');

// Let user select & remember their preference
const lastOutputPath = context.globalState.get('lastOutputPath') || defaultOutputPath;
```

3. **Ensure directories exist before writing files**:
```javascript
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// Usage
const outputDir = ensureDirectoryExists(path.join(storageUri.fsPath, 'outputs'));
fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(data));
```

4. **Store user preferences with extension state**:
```javascript
// Save preference
context.globalState.update('outputDirectory', userSelectedPath);

// Retrieve preference
const outputDir = context.globalState.get('outputDirectory') || defaultPath;
```

### Temporary Files

1. **Use the OS temporary directory**:
```javascript
const tempDir = path.join(os.tmpdir(), 'my-extension-temp');
ensureDirectoryExists(tempDir);
const tempFilePath = path.join(tempDir, `temp-${Date.now()}.json`);
```

2. **Clean up temporary files when done**:
```javascript
function cleanupTempFiles() {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to cleanup temp files:', err);
  }
}

// Call during deactivation or after processing
context.subscriptions.push({ dispose: cleanupTempFiles });
```

## Debugging Considerations

1. **Log all critical paths on activation**:
```javascript
console.log('Extension path:', context.extensionPath);
console.log('Storage path:', context.globalStorageUri.fsPath);
console.log('Working directory:', process.cwd());
```

2. **Add environment variables to launch.json for debugging**:
```json
{
  "configurations": [
    {
      "name": "Extension",
      "type": "extensionHost",
      "env": {
        "VSCODE_DEBUG_MODE": "true",
        "NODE_ENV": "development"
      }
    }
  ]
}
```

3. **Detect debug mode and adjust behavior if needed**:
```javascript
const isDebugging = process.env.VSCODE_DEBUG_MODE === "true";

// Optional: Use workspace paths during debugging for easier development
const templatesPath = isDebugging && vscode.workspace.workspaceFolders ? 
  path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'templates/textfsm') :
  path.join(context.extensionPath, 'templates/textfsm');
```

## Extension Packaging Considerations

1. **Include all required files in your package.json**:
```json
"files": [
  "templates/**",
  "lib/**",
  "webview/**",
  "assets/**"
],
```

2. **If bundling with webpack or esbuild, configure non-code assets properly**:
```js
// webpack.config.js example
module.exports = {
  // ...
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "templates", to: "templates" },
        { from: "webview", to: "webview" },
      ],
    }),
  ],
};
```

3. **Use the extension's package.json to define contributes and engines**:
```json
"contributes": {
  "commands": [
    {
      "command": "myExtension.start",
      "title": "Start My Extension"
    }
  ]
},
"engines": {
  "vscode": "^1.60.0"
}
```

## Implementation Examples

### Extension Activation

```javascript
function activate(context) {
  // Store the extension path for all components to use
  const extensionPath = context.extensionPath;
  
  // Extension resource paths
  const templatesPath = path.join(extensionPath, 'templates', 'textfsm');
  const libPath = path.join(extensionPath, 'lib');
  
  // User data paths - use extension storage
  const outputPath = context.globalState.get('outputPath') || 
    path.join(context.globalStorageUri.fsPath, 'output');
  
  // Ensure directories exist
  ensureDirectoryExists(outputPath);
  
  // Set up path configuration for all components
  const pathConfig = {
    templatesPath,
    libPath,
    outputPath,
    // Add other paths as needed
  };
  
  // Log paths in debug mode
  if (process.env.VSCODE_DEBUG_MODE === "true") {
    console.log('Path configuration:', pathConfig);
  }
  
  // Initialize your components with explicit paths
  const networkDiscovery = new NetworkDiscovery(pathConfig);
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('myExtension.start', () => {
      startExtension(networkDiscovery, pathConfig);
    })
  );
}
```

### Handling Webview Resources

```javascript
function createWebview(context) {
  const panel = vscode.window.createWebviewPanel(
    'myWebview',
    'My Extension',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview')
      ]
    }
  );
  
  // Get URIs for webview resources
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'webview', 'main.js')
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'webview', 'style.css')
  );
  
  // Inject these URIs into your HTML
  panel.webview.html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${styleUri}">
    <title>My Extension</title>
  </head>
  <body>
    <h1>My Extension</h1>
    <script src="${scriptUri}"></script>
  </body>
  </html>`;
  
  return panel;
}
```

### Path Utility Functions

```javascript
// Helper functions for path management
const pathUtils = {
  // Ensure a directory exists
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  },
  
  // Get a temporary file path
  getTempFilePath(extension = '.tmp') {
    const tempDir = path.join(os.tmpdir(), 'my-extension');
    this.ensureDirectoryExists(tempDir);
    return path.join(tempDir, `temp-${Date.now()}${extension}`);
  },
  
  // Normalize a user-provided path
  normalizePath(inputPath) {
    // Convert to absolute if not already
    if (!path.isAbsolute(inputPath)) {
      // If workspace is available, resolve against it
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, inputPath);
      }
      // Otherwise resolve against current working directory
      return path.resolve(inputPath);
    }
    return inputPath;
  },
  
  // Clean up temporary files
  cleanupTempFiles() {
    const tempDir = path.join(os.tmpdir(), 'my-extension');
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to cleanup temp directory:', err);
      }
    }
  }
};
```

## Managing External Command Execution

When your extension needs to execute external commands (using Node.js child processes), managing the current working directory (cwd) is crucial. This is especially important when these commands need to access files relative to a specific location.

### Challenges with External Command Execution

1. **Unpredictable CWD**: The default working directory for child processes can vary based on how VS Code was launched
2. **Path Resolution**: External commands may resolve relative paths differently than your extension
3. **Environment Variables**: External commands may need environment variables with proper paths
4. **Different Platforms**: Command execution syntax and path handling differs between platforms
5. **Extension Packaging**: After packaging, the location of bundled executables will change

### Best Practices for External Commands

1. **Always specify an explicit working directory**:
```javascript
const { spawn, exec } = require('child_process');

// DON'T
exec('my-command --config=config.json');

// DO
const cwd = path.join(context.extensionPath, 'bin');
exec('my-command --config=config.json', { cwd });
```

2. **Use absolute paths for all command arguments**:
```javascript
// DON'T
spawn('node', ['script.js', './input.txt']);

// DO
const scriptPath = path.join(context.extensionPath, 'scripts', 'script.js');
const inputPath = path.join(workingDir, 'input.txt');
spawn('node', [scriptPath, inputPath]);
```

3. **Provide a complete environment with PATH and custom variables**:
```javascript
const env = { ...process.env }; // Clone current environment

// Add extension-specific bin directory to PATH
const binDir = path.join(context.extensionPath, 'bin');
if (process.platform === 'win32') {
  env.PATH = `${binDir};${env.PATH}`;
} else {
  env.PATH = `${binDir}:${env.PATH}`;
}

// Add custom environment variables with absolute paths
env.TEMPLATE_DIR = path.join(context.extensionPath, 'templates');
env.OUTPUT_DIR = outputPath;

// Execute with the customized environment
spawn('my-command', args, { env, cwd: workingDir });
```

4. **Handle platform-specific executable paths**:
```javascript
function getExecutablePath(executableName) {
  const platform = process.platform;
  const extension = platform === 'win32' ? '.exe' : '';
  const executable = `${executableName}${extension}`;
  
  return path.join(context.extensionPath, 'bin', platform, executable);
}

const crawlerPath = getExecutablePath('network-crawler');
spawn(crawlerPath, args, { cwd: workingDir });
```

5. **Create a dedicated working directory for command execution**:
```javascript
function createCommandWorkingDir(commandName) {
  // Create a unique working directory for this command run
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workingDir = path.join(
    context.globalStorageUri.fsPath, 
    'command-workspaces', 
    `${commandName}-${timestamp}`
  );
  
  // Ensure it exists
  ensureDirectoryExists(workingDir);
  
  return workingDir;
}

// Usage
const workingDir = createCommandWorkingDir('network-discovery');
// Copy necessary files to working directory or use absolute paths

// Execute command
const proc = spawn('crawler', args, { cwd: workingDir });

// Track the working directory to clean it up later
activeWorkingDirs.push(workingDir);
```

6. **Prepare the working directory with necessary files**:
```javascript
function prepareWorkingDirectory(workingDir, neededFiles) {
  // Copy configuration files to the working directory
  for (const [sourcePath, targetName] of neededFiles) {
    const targetPath = path.join(workingDir, targetName);
    fs.copyFileSync(sourcePath, targetPath);
  }
  
  return workingDir;
}

// Usage
const workingDir = createCommandWorkingDir('network-discovery');
prepareWorkingDirectory(workingDir, [
  [path.join(context.extensionPath, 'config', 'default-config.json'), 'config.json'],
  [userConfigPath, 'user-config.json']
]);
```

7. **Create wrapper functions for common command patterns**:
```javascript
/**
 * Execute a command with proper path and environment handling
 * @param {string} command - The command to execute
 * @param {string[]} args - Command arguments
 * @param {object} options - Additional options
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function executeCommand(command, args, options = {}) {
  // Default options
  const defaultOptions = {
    cwd: options.cwd || context.extensionPath,
    useExtensionPath: options.useExtensionPath !== false,
    env: { ...process.env },
    resolveRelativePaths: options.resolveRelativePaths !== false,
    shell: process.platform === 'win32'
  };
  
  const opts = { ...defaultOptions, ...options };
  
  // If command is relative and should use extension path, resolve it
  if (opts.useExtensionPath && !path.isAbsolute(command) && command.startsWith('./')) {
    command = path.join(context.extensionPath, command.slice(2));
  }
  
  // Resolve any relative paths in arguments
  if (opts.resolveRelativePaths) {
    args = args.map(arg => {
      if (typeof arg === 'string' && arg.startsWith('./')) {
        return path.join(opts.cwd, arg.slice(2));
      }
      return arg;
    });
  }
  
  // Return a promise for the command execution
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    
    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      shell: opts.shell
    });
    
    proc.stdout.on('data', data => {
      stdout += data.toString();
      if (opts.onStdout) opts.onStdout(data.toString());
    });
    
    proc.stderr.on('data', data => {
      stderr += data.toString();
      if (opts.onStderr) opts.onStderr(data.toString());
    });
    
    proc.on('close', code => {
      resolve({ stdout, stderr, code });
    });
    
    proc.on('error', err => {
      reject(err);
    });
  });
}

// Usage example
try {
  const result = await executeCommand('./bin/network-crawler', [
    '--config=config.json',
    '--output=results.json'
  ], {
    cwd: workingDir,
    onStdout: (data) => console.log(`Crawler output: ${data}`)
  });
  
  console.log(`Command completed with code ${result.code}`);
} catch (err) {
  console.error('Command execution failed:', err);
}
```

### Implementation Example

Here's a complete implementation example for network discovery tool execution:

```javascript
async function runNetworkDiscovery(settings, progressCallback) {
  // 1. Create a dedicated working directory
  const workingDir = createCommandWorkingDir('network-discovery');
  
  // 2. Write the settings to a config file in the working directory
  const configPath = path.join(workingDir, 'discovery-config.json');
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
  
  // 3. Create credentials file
  const credsPath = path.join(workingDir, 'creds.json');
  fs.writeFileSync(credsPath, JSON.stringify(settings.credentials, null, 2));
  
  // 4. Determine the path to the crawler executable
  let crawlerPath;
  if (process.env.VSCODE_DEBUG_MODE === "true" && fs.existsSync('./crawl4.js')) {
    // In debug mode, use the local script directly with Node
    crawlerPath = process.execPath; // Node.js executable
    var args = [
      path.join(context.extensionPath, 'crawl4.js'),
      '--seed', settings.seedDevices,
      '--exclude', settings.exclusions || '',
      '--max-hops', settings.maxHops.toString(),
      '--creds-file', credsPath
    ];
  } else {
    // In production, use the bundled executable
    crawlerPath = getExecutablePath('network-crawler');
    var args = [
      '--config', configPath,
      '--creds-file', credsPath
    ];
  }
  
  // 5. Setup environment variables
  const env = { ...process.env };
  env.NET_TEXTFSM = path.join(context.extensionPath, 'templates', 'textfsm');
  env.OUTPUT_DIR = settings.outputDirectory || workingDir;
  
  // 6. Execute the command
  try {
    progressCallback('Starting network discovery process...');
    
    const result = await executeCommand(crawlerPath, args, {
      cwd: workingDir,
      env: env,
      onStdout: (data) => {
        // Look for progress messages and report them
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.includes('DISCOVERY_PROGRESS:')) {
            progressCallback(line.split('DISCOVERY_PROGRESS:')[1].trim());
          }
        }
      }
    });
    
    // 7. Process the results
    if (result.code === 0) {
      // Check for output files in the working directory
      const outputFile = path.join(workingDir, 'network_topology.json');
      const graphFile = path.join(workingDir, 'network_topology_graph.json');
      
      // Copy to user-specified location if needed
      if (settings.outputDirectory && settings.outputDirectory !== workingDir) {
        const userOutputFile = path.join(settings.outputDirectory, 'network_topology.json');
        const userGraphFile = path.join(settings.outputDirectory, 'network_topology_graph.json');
        
        ensureDirectoryExists(settings.outputDirectory);
        if (fs.existsSync(outputFile)) {
          fs.copyFileSync(outputFile, userOutputFile);
        }
        if (fs.existsSync(graphFile)) {
          fs.copyFileSync(graphFile, userGraphFile);
        }
      }
      
      return {
        success: true,
        outputFile: settings.outputDirectory ? 
          path.join(settings.outputDirectory, 'network_topology.json') : outputFile,
        graphFile: settings.outputDirectory ? 
          path.join(settings.outputDirectory, 'network_topology_graph.json') : graphFile,
        workingDir: workingDir
      };
    } else {
      throw new Error(`Network discovery failed with code ${result.code}: ${result.stderr}`);
    }
  } catch (err) {
    // Clean up the working directory on failure
    try {
      fs.rmSync(workingDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Failed to clean up working directory:', cleanupErr);
    }
    
    throw err;
  }
}
```

This approach provides a robust way to execute external commands while managing paths and working directories correctly in both development and production environments.

## Common Pitfalls

1. **Using `__dirname` in packaged extensions**
   - Problem: `__dirname` refers to the location of the executing JavaScript file, which changes after packaging
   - Solution: Use `context.extensionPath` instead

2. **Relative paths with changing working directory**
   - Problem: Relative paths like `./templates` depend on the current working directory
   - Solution: Always use absolute paths based on `context.extensionPath`

3. **Hardcoded path separators**
   - Problem: Using `/` or `\\` directly doesn't work cross-platform
   - Solution: Use `path.join()` or `path.resolve()` for all path construction

4. **Not checking if directories exist**
   - Problem: Writing to non-existent directories causes errors
   - Solution: Use `ensureDirectoryExists()` before writing files

5. **Assuming environment variables are available**
   - Problem: Environment variables set during development may not exist in production
   - Solution: Pass explicit paths rather than relying on environment variables

6. **Not cleaning up temporary files**
   - Problem: Accumulated temporary files waste disk space
   - Solution: Implement cleanup during extension deactivation or after processing

7. **Using invalid paths in webviews**
   - Problem: Local file paths don't work in webviews due to security restrictions
   - Solution: Convert paths using `webview.asWebviewUri()`

8. **Ignoring file permission issues**
   - Problem: Writing to system directories may fail due to permissions
   - Solution: Use user-writable locations like global storage or home directory

By following these guidelines, your VS Code extension will handle file paths correctly across all environments and platforms, providing a reliable experience for your users.