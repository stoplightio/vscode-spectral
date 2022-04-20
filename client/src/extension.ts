import * as path from 'path';
import {
  commands as Commands,
  ExtensionContext,
  window as Window,
  workspace as Workspace,
  FileSystemWatcher,
} from 'vscode';
import {
  DidChangeWatchedFilesNotification,
  DidChangeWatchedFilesParams,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind,
  FileChangeType,
  Disposable,
} from 'vscode-languageclient';
import { ExtensionSettings } from './configuration';
import { StartWatcherNotification, StartWatcherParams } from './notifications';

let client: LanguageClient;
let commands: Disposable[] | undefined = undefined;

/**
 * The set of FileSystemWatcher objects that monitor Spectral configuration
 * files. The key is the path to the config file being watched.
 */
const watchers: Map<string, FileSystemWatcher> = new Map<string, FileSystemWatcher>();

/**
 * Creates a FileSystemWatcher that will marshal change events to the server.
 * @param {string} path - The path to the file to monitor.
 * @return {FileSystemWatcher} A FileSystemWatcher that monitors the provided path.
 */
function createFileSystemWatcher(path: string): FileSystemWatcher {
  const watcher = Workspace.createFileSystemWatcher(path);

  watcher.onDidChange((event) => {
    client.info(`Ruleset file change: ${event.fsPath}`);
    sendFileChangeNotification(event.toString(), FileChangeType.Changed);
  });
  watcher.onDidDelete((event) => {
    client.info(`Ruleset deleted: ${event.fsPath}`);
    sendFileChangeNotification(event.toString(), FileChangeType.Deleted);
  });
  watcher.onDidCreate((event) => {
    client.info(`Ruleset created: ${event.fsPath}`);
    sendFileChangeNotification(event.toString(), FileChangeType.Created);
  });

  return watcher;
}

/**
 * Handles changes in configuration or workspace by disposing existing cached
 * FileSystemWatchers and preparing the cache for new watchers.
 */
function environmentChange(): void {
  for (const watcher of watchers.values()) {
    watcher.dispose();
  }

  watchers.clear();
}

/**
 * Marshals a file change notification to the server so it can flush cached
 * settings and revalidate documents.
 * @param {string} uri - The URI of the file that changed.
 * @param {FileChangeType} type - The type of change event that occurred.
 */
function sendFileChangeNotification(uri: string, type: FileChangeType): void {
  const e: DidChangeWatchedFilesParams = { changes: [{ uri: uri, type: type }] };
  client.sendNotification(DidChangeWatchedFilesNotification.type, e);
}

/**
 * Called to initialize the extension and start the language server.
 * @param {ExtensionContext} context - Information about the extension runtime that can be used during activation.
 */
export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join('server', 'index.js'));

  // Debug will listen on port 6262 in Node Inspector mode so VS Code can
  // attach. That needs to match .vscode/launch.json settings in this workspace.
  // It'll only be used if the debug mode is used during launch; otherwise it'll
  // be just the run options.
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6262'],
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    // Register for all files and untitled documents. The settings
    // for language type IDs and glob patterns will control whether
    // linting actually occurs.
    documentSelector: [{ scheme: 'file' }, { scheme: 'untitled' }],
    diagnosticCollectionName: 'spectral',
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationFailedHandler: (error) => {
      client.error('Server initialization failed.', error);
      client.outputChannel.show(true);
      return false;
    },
    middleware: {
      workspace: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configuration: async (params, _token, _next): Promise<any[]> => {
          // The configuration middleware allows us to modify config and/or set
          // defaults before it gets to the server. Also, the workspace folder
          // is available in the client but not the server, so we add that on
          // the fly.
          if (params.items === undefined) {
            return [];
          }
          const result: (ExtensionSettings | null)[] = [];
          for (const item of params.items) {
            if (item.section || !item.scopeUri) {
              result.push(null);
              continue;
            }
            const resource = client.protocol2CodeConverter.asUri(item.scopeUri);
            const config = Workspace.getConfiguration('spectral', resource);
            const workspaceFolder = Workspace.getWorkspaceFolder(resource);
            const settings: ExtensionSettings = {
              // The defaults should match the package.json.
              enable: config.get('enable', true),
              rulesetFile: config.get('rulesetFile', undefined),
              run: config.get('run', 'onType'),
              validateFiles: config.get('validateFiles', []),
              validateLanguages: config.get('validateLanguages', ['json', 'yaml']),
              workspaceFolder: undefined,
            };
            if (workspaceFolder !== undefined) {
              settings.workspaceFolder = {
                name: workspaceFolder.name,
                uri: client.code2ProtocolConverter.asUri(workspaceFolder.uri),
              };
            }
            result.push(settings);
          }
          return result;
        },
        didChangeConfiguration: (event, next): void => {
          environmentChange();
          next(event);
        },
        didChangeWorkspaceFolders: (event, next): void => {
          environmentChange();
          next(event);
        },
      },
    },
  };

  // Create the language client and start the client. This will also launch the
  // server.
  try {
    client = new LanguageClient('spectral', 'Spectral', serverOptions, clientOptions);
  } catch (err) {
    Window.showErrorMessage(`The Spectral extension couldn't be started. See the Spectral output channel for details.`);
    return;
  }

  client.onReady().then(() => {
    client.onNotification(StartWatcherNotification.type, (params: StartWatcherParams) => {
      // The language server lets us know which ruleset files to watch since
      // it's configurable and depends on the file/location being validated. We
      // don't use the built-in synchronization setup because the set of
      // monitored files can differ.
      if (!watchers.has(params.path)) {
        client.info(`Watching: ${params.path}`);
        const watcher = createFileSystemWatcher(params.path);
        watchers.set(params.path, watcher);
      }
    });
  });

  client.start();

  commands = [Commands.registerCommand('spectral.showOutputChannel', () => {
    client.outputChannel.show();
  })];
}

/**
 * Called when the extension is deactivated to shut down the language server and
 * dispose of resources.
 * @return {Thenable<void>|undefined} A promise to await deactivation.
 */
export function deactivate(): Thenable<void> | undefined {
  if (commands !== undefined) {
    commands.forEach((d) => d.dispose());
    commands = undefined;
  }

  if (!client) {
    return undefined;
  }
  return client.stop();
}
