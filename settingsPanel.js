// settingsPanel.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

console.log('Loading settingsPanel.js module');

class SettingsPanel {
  static currentPanel = undefined;
  static viewType = 'networkMapperSettings';

  static createOrShow(context, settingsManager) {
    console.log('SettingsPanel.createOrShow called');
    
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      'Network Mapper Settings',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'webview')
        ],
        retainContextWhenHidden: true
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, context, settingsManager);
  }

  constructor(panel, context, settingsManager) {
    this._panel = panel;
    this._context = context;
    this._settingsManager = settingsManager;
    this._disposables = [];

    // Set initial HTML content
    this._update();

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'saveSettings':
            this._handleSaveSettings(message.settings);
            return;
          case 'exportSettings':
            await this._handleExportSettings();
            return;
          case 'importSettings':
            await this._handleImportSettings();
            return;
          case 'getPathInfo':
            this._sendPathInfo();
            return;
          case 'browseDirectory':
            await this._handleBrowseDirectory(message.key);
            return;
          case 'closePanel':
            this._panel.dispose();
            return;
        }
      },
      null,
      this._disposables
    );

    // Clean up resources when the panel is closed
    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );
  }

  dispose() {
    SettingsPanel.currentPanel = undefined;

    // Clean up resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  // Update the webview content
  _update() {
    const webview = this._panel.webview;
    this._panel.title = "Network Mapper Settings";
    this._panel.webview.html = this._getHtmlForWebview(webview);
    
    // Send current settings to the webview
    this._sendSettingsToWebview();
  }

  // Send current settings to the webview
  _sendSettingsToWebview() {
    this._panel.webview.postMessage({
      command: 'loadSettings',
      settings: this._settingsManager.getAllSettings()
    });
  }

  // Send path information for debugging
  _sendPathInfo() {
    this._panel.webview.postMessage({
      command: 'pathInfo',
      pathInfo: this._settingsManager.getPathInfo()
    });
  }

  // Handle saving settings
  _handleSaveSettings(settings) {
    Object.keys(settings).forEach(key => {
      this._settingsManager.setSetting(key, settings[key]);
    });
    
    vscode.window.showInformationMessage('Network Mapper settings saved successfully');
  }

  // Handle exporting settings to file
  async _handleExportSettings() {
    const fileUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('network_mapper_settings.json'),
      filters: {
        'JSON Files': ['json']
      },
      title: 'Export Network Mapper Settings'
    });

    if (fileUri) {
      if (this._settingsManager.exportSettings(fileUri.fsPath)) {
        vscode.window.showInformationMessage(`Settings exported to ${fileUri.fsPath}`);
      } else {
        vscode.window.showErrorMessage('Failed to export settings');
      }
    }
  }

  // Handle importing settings from file
  async _handleImportSettings() {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'JSON Files': ['json']
      },
      title: 'Import Network Mapper Settings'
    });

    if (fileUris && fileUris.length > 0) {
      if (this._settingsManager.importSettings(fileUris[0].fsPath)) {
        vscode.window.showInformationMessage('Settings imported successfully');
        this._sendSettingsToWebview(); // Refresh the webview
      } else {
        vscode.window.showErrorMessage('Failed to import settings');
      }
    }
  }

  // Handle directory browsing
  async _handleBrowseDirectory(key) {
    const currentPath = this._settingsManager.getSetting(key) || '';
    
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(currentPath),
      title: `Select ${key} Directory`
    });

    if (folderUri && folderUri.length > 0) {
      this._settingsManager.setSetting(key, folderUri[0].fsPath);
      this._sendSettingsToWebview(); // Refresh the webview
    }
  }

  // Generate the HTML for the settings webview
  _getHtmlForWebview(webview) {
    try {
      // Get path to the webview resources
      const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'settingsView.js')
      );
      const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'main.css')
      );
      
      // Load HTML template
      const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'settings.html').fsPath;
      console.log('Loading settings HTML template from:', htmlPath);
      
      if (!fs.existsSync(htmlPath)) {
        console.error(`Settings HTML template not found at: ${htmlPath}`);
        throw new Error(`Settings HTML template not found at: ${htmlPath}`);
      }
      
      let html = fs.readFileSync(htmlPath, 'utf8');
      
      // Replace placeholders
      html = html.replace(/\${cspSource}/g, webview.cspSource);
      html = html.replace(/\${scriptUri}/g, scriptUri);
      html = html.replace(/\${styleUri}/g, styleUri);
      
      return html;
    } catch (error) {
      console.error(`Error loading settings HTML: ${error.message}`);
      
      // Fallback simple HTML if file not found
      return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'unsafe-inline';">
        <title>Network Mapper Settings</title>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          .error { color: var(--vscode-errorForeground); }
        </style>
      </head>
      <body>
        <h2>Network Mapper Settings</h2>
        <p class="error">Error loading the settings interface. Please check the console for details.</p>
        <p>Error: ${error.message}</p>
        <script>
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'error', message: 'Failed to load settings HTML template' });
        </script>
      </body>
      </html>`;
    }
  }
}

console.log('settingsPanel.js module loaded and exported');

module.exports = SettingsPanel;