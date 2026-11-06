const vscode = require('vscode');
const { childUri, statIfExists, findWordPressRoot } = require('./wordpress');

class DebugFilesProvider {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
  }

  refresh() {
    this.changed.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    try {
      if (element?.root) {
        return await Promise.all(
          ['wp-config.php', 'wp-content/debug.log'].map(async (relativePath) => {
            const uri = childUri(element.root, relativePath);
            const stat = await statIfExists(vscode.workspace.fs, uri);
            const exists = Boolean(stat && (stat.type & vscode.FileType.File));
            const item = new vscode.TreeItem(relativePath);
            item.resourceUri = uri;
            item.description = exists ? undefined : 'not found';
            item.tooltip = `${uri.fsPath}${exists ? '' : '\nThis file does not exist yet.'}`;
            item.iconPath = new vscode.ThemeIcon(
              exists ? (relativePath.endsWith('.log') ? 'output' : 'file-code') : 'warning'
            );
            item.command = {
              command: 'wordpressDebugging.openFile',
              title: 'Open Debug File',
              arguments: [uri]
            };
            return item;
          })
        );
      }
      if (element) {
        return [];
      }
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (!folders.length) {
        return [this.message('Open a WordPress theme folder to get started.')];
      }
      return await Promise.all(folders.map(async (folder) => {
        const root = await findWordPressRoot(folder.uri, vscode.workspace.fs, vscode.FileType);
        if (!root) {
          return this.message(`${folder.name}: WordPress installation not found`);
        }
        const item = new vscode.TreeItem(folder.name, vscode.TreeItemCollapsibleState.Expanded);
        item.root = root;
        item.description = 'WordPress';
        item.tooltip = root.fsPath;
        item.iconPath = new vscode.ThemeIcon('folder');
        return item;
      }));
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to find WordPress debug files: ${error.message}`);
      throw error;
    }
  }

  message(label) {
    const item = new vscode.TreeItem(label);
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }

  dispose() {
    this.changed.dispose();
  }
}

function activate(context) {
  const provider = new DebugFilesProvider();
  context.subscriptions.push(
    provider,
    vscode.window.registerTreeDataProvider('wordpressDebugging.files', provider),
    vscode.commands.registerCommand('wordpressDebugging.refresh', () => provider.refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.commands.registerCommand('wordpressDebugging.openFile', async (uri) => {
      if (!(uri instanceof vscode.Uri)) {
        vscode.window.showErrorMessage('Select a debug file in the WordPress Debugging sidebar.');
        return;
      }
      try {
        const stat = await statIfExists(vscode.workspace.fs, uri);
        if (!stat || !(stat.type & vscode.FileType.File)) {
          vscode.window.showErrorMessage(
            `WordPress debug file not found: ${uri.fsPath}. No file was created.`
          );
          return;
        }
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      } catch (error) {
        vscode.window.showErrorMessage(`Unable to open ${uri.fsPath}: ${error.message}`);
      }
    })
  );
}

module.exports = { activate };
