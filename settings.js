// settings.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

console.log('Loading settings.js module');

class SettingsManager {
  constructor(context) {
    console.log('SettingsManager constructor called');
    
    if (!context) {
      throw new Error('Extension context is undefined in SettingsManager constructor');
    }
    
    console.log('Context object received:', Object.keys(context));
    
    this.context = context;
    
    try {
      this.extensionSettings = vscode.workspace.getConfiguration('networkMapper');
      console.log('Extension settings loaded:', this.extensionSettings ? 'yes' : 'no');
    } catch (e) {
      console.error('Error loading workspace configuration:', e);
      this.extensionSettings = {};
    }
    
    try {
      this.defaultSettings = this._getDefaultSettings();
      console.log('Default settings created');
    } catch (e) {
      console.error('Error creating default settings:', e);
      throw new Error(`Failed to create default settings: ${e.message}`);
    }
    
    try {
      this.currentSettings = this._loadSettings();
      console.log('Current settings loaded');
    } catch (e) {
      console.error('Error loading settings:', e);
      this.currentSettings = { ...this.defaultSettings };
    }
    
    console.log('SettingsManager initialized successfully');
  }

  // Get default settings with proper extension paths
  _getDefaultSettings() {
    console.log('Creating default settings with extensionPath:', this.context.extensionPath);
    const globalStoragePath = this.context.globalStorageUri ? 
      this.context.globalStorageUri.fsPath : 
      path.join(this.context.extensionPath, 'storage');
      
    console.log('Global storage path:', globalStoragePath);
    
    return {
      // Extension paths (not user configurable, but visible for debugging)
      extensionPath: this.context.extensionPath,
      templatePath: path.join(this.context.extensionPath, 'templates', 'textfsm'),
      storagePath: globalStoragePath,
      
      // User configurable paths
      outputDirectory: path.join(globalStoragePath, 'output'),
      userTemplatesDirectory: path.join(globalStoragePath, 'templates'),
      
      // Discovery settings
      maxHops: 4,
      maxThreads: 1,
      scanTimeout: 60000,
      
      // Last used values (remembered between sessions)
      lastSeedDevices: '',
      lastCredentials: '',
      lastExclusions: '',
      lastOutputFile: 'network_topology.json',
      
      // UI preferences
      logLevel: 'info',
      autoScrollLogs: true
    };
  }

  // Load settings from VSCode storage
  _loadSettings() {
    console.log('Loading settings from VS Code storage');
    // Start with defaults
    const settings = { ...this.defaultSettings };
    
    // Load from global state
    try {
      if (this.context.globalState) {
        const savedSettings = this.context.globalState.get('networkMapperSettings');
        if (savedSettings) {
          console.log('Found saved settings in global state:', Object.keys(savedSettings));
          Object.assign(settings, savedSettings);
        } else {
          console.log('No saved settings found in global state');
        }
      } else {
        console.warn('Context.globalState is not available');
      }
    } catch (e) {
      console.error('Error loading settings from global state:', e);
    }
    
    // Apply VSCode workspace settings that override stored settings
    try {
      if (this.extensionSettings) {
        if (this.extensionSettings.has && this.extensionSettings.has('outputPath')) {
          settings.outputDirectory = this.extensionSettings.get('outputPath') || settings.outputDirectory;
          console.log(`Applied outputPath from workspace settings: ${settings.outputDirectory}`);
        }
        if (this.extensionSettings.has && this.extensionSettings.has('templatePath')) {
          const configTemplatePath = this.extensionSettings.get('templatePath');
          if (configTemplatePath) {
            settings.templatePath = configTemplatePath;
            console.log(`Applied templatePath from workspace settings: ${settings.templatePath}`);
          }
        }
        if (this.extensionSettings.has && this.extensionSettings.has('maxHops')) {
          settings.maxHops = this.extensionSettings.get('maxHops');
          console.log(`Applied maxHops from workspace settings: ${settings.maxHops}`);
        }
      }
    } catch (e) {
      console.error('Error applying workspace settings:', e);
    }
    
    // Ensure critical directories exist
    try {
      this._ensureDirectoryExists(settings.outputDirectory);
      this._ensureDirectoryExists(settings.userTemplatesDirectory);
    } catch (e) {
      console.error('Error ensuring directories exist:', e);
    }
    
    return settings;
  }

  // Save current settings to VSCode storage
  saveSettings() {
    console.log('Saving settings to VS Code storage');
    try {
      // Save user-configurable settings only (not paths that are derived from context)
      const settingsToSave = { 
        outputDirectory: this.currentSettings.outputDirectory,
        userTemplatesDirectory: this.currentSettings.userTemplatesDirectory,
        maxHops: this.currentSettings.maxHops,
        maxThreads: this.currentSettings.maxThreads,
        scanTimeout: this.currentSettings.scanTimeout,
        lastSeedDevices: this.currentSettings.lastSeedDevices,
        lastCredentials: this.currentSettings.lastCredentials,
        lastExclusions: this.currentSettings.lastExclusions,
        lastOutputFile: this.currentSettings.lastOutputFile,
        logLevel: this.currentSettings.logLevel,
        autoScrollLogs: this.currentSettings.autoScrollLogs
      };
      
      if (this.context.globalState) {
        this.context.globalState.update('networkMapperSettings', settingsToSave);
        console.log('Settings saved successfully');
        return true;
      } else {
        console.error('Cannot save settings: context.globalState is not available');
        return false;
      }
    } catch (e) {
      console.error('Error saving settings:', e);
      return false;
    }
  }

  // Update form values from last session
  updateLastUsedValues(formData) {
    console.log('Updating last used values from form data');
    try {
      if (formData.seedDevices) {
        this.currentSettings.lastSeedDevices = formData.seedDevices;
      }
      if (formData.credentials) {
        this.currentSettings.lastCredentials = formData.credentials;
      }
      if (formData.exclusions) {
        this.currentSettings.lastExclusions = formData.exclusions;
      }
      if (formData.outputFile) {
        this.currentSettings.lastOutputFile = formData.outputFile;
      }
      if (formData.maxHops) {
        this.currentSettings.maxHops = parseInt(formData.maxHops);
      }
      
      return this.saveSettings();
    } catch (e) {
      console.error('Error updating last used values:', e);
      return false;
    }
  }

  // Export settings to a JSON file
  exportSettings(filePath) {
    console.log(`Exporting settings to: ${filePath}`);
    try {
      // Create a copy that doesn't include sensitive data
      const exportedSettings = { ...this.currentSettings };
      delete exportedSettings.lastCredentials; // Don't export saved credentials for security
      
      // Write to the file
      fs.writeFileSync(filePath, JSON.stringify(exportedSettings, null, 2));
      console.log('Settings exported successfully');
      return true;
    } catch (error) {
      console.error('Error exporting settings:', error);
      return false;
    }
  }

  // Import settings from a JSON file
  importSettings(filePath) {
    console.log(`Importing settings from: ${filePath}`);
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`Settings file not found: ${filePath}`);
        return false;
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const importedSettings = JSON.parse(fileContent);
      
      // Merge with current settings (keeping critical paths)
      const newSettings = {
        ...this.currentSettings,
        ...importedSettings,
        // Keep extension paths as they are
        extensionPath: this.currentSettings.extensionPath,
        templatePath: this.currentSettings.templatePath,
        storagePath: this.currentSettings.storagePath
      };
      
      this.currentSettings = newSettings;
      this.saveSettings();
      console.log('Settings imported successfully');
      return true;
    } catch (error) {
      console.error('Error importing settings:', error);
      return false;
    }
  }

  // Helper method to ensure a directory exists
  _ensureDirectoryExists(dirPath) {
    console.log(`Ensuring directory exists: ${dirPath}`);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      }
      return dirPath;
    } catch (e) {
      console.error(`Error creating directory ${dirPath}:`, e);
      // Return the path anyway, even if we couldn't create it
      return dirPath;
    }
  }

  // Get all settings
  getAllSettings() {
    console.log('Getting all settings');
    return { ...this.currentSettings };
  }

  // Set a specific setting
  setSetting(key, value) {
    console.log(`Setting ${key} = ${value}`);
    try {
      if (key in this.currentSettings) {
        this.currentSettings[key] = value;
        this.saveSettings();
        return true;
      }
      console.log(`Setting ${key} not found in current settings`);
      return false;
    } catch (e) {
      console.error(`Error setting ${key}:`, e);
      return false;
    }
  }

  // Get a specific setting
  getSetting(key) {
    console.log(`Getting setting: ${key}`);
    try {
      return this.currentSettings[key];
    } catch (e) {
      console.error(`Error getting setting ${key}:`, e);
      return undefined;
    }
  }

  // Get all path information (for debugging)
  getPathInfo() {
    console.log('Getting path info');
    try {
      return {
        extensionPath: this.context.extensionPath,
        storageUri: this.context.globalStorageUri ? this.context.globalStorageUri.fsPath : 'not available',
        workspaceStorageUri: this.context.storageUri ? this.context.storageUri.fsPath : 'not available',
        workspaceFolders: vscode.workspace.workspaceFolders ? 
          vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath) : 'not available',
        logExtensionPath: this.currentSettings.extensionPath,
        outputDirectory: this.currentSettings.outputDirectory,
        templatePath: this.currentSettings.templatePath,
        userTemplatesDirectory: this.currentSettings.userTemplatesDirectory,
        processWorkingDirectory: process.cwd()
      };
    } catch (e) {
      console.error('Error getting path info:', e);
      return {
        error: e.message,
        stack: e.stack
      };
    }
  }
}

// Add this to make the module's loading visible in logs
console.log('settings.js module loaded, exporting SettingsManager class');

module.exports = SettingsManager;   