// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { IRuleResult, IRunOpts, ISpectralFullResult, Spectral } from '@stoplight/spectral';
import * as vscode from 'vscode';
import { LinterCache } from './linter';
import { groupWarningsBySource, ourSeverity } from './utils';

export declare type IEventData = Map<string, IRuleResult[]> | Error;
export interface IExtensionAPI {
  spectralNotification: vscode.Event<IEventData>;
}

const LINT_ON_SAVE_TIMEOUT = 2000; // fallback value. If changed, also update package.json
const dc = vscode.languages.createDiagnosticCollection('spectral');
const eventEmitter = new vscode.EventEmitter<IEventData>();
const ourAPI: IExtensionAPI = { spectralNotification: eventEmitter.event };
const linterCache = new LinterCache();
const clampRanges = vscode.workspace.getConfiguration('spectral').get('clampRanges');

let documentChangeTimeout: NodeJS.Timeout;

function validateDocument(document: vscode.TextDocument, expectedStructured: boolean) {
  return new Promise((resolve, reject) => {
    if (!expectedStructured) {
      const lang = document.languageId;
      if (lang !== 'json' && lang !== 'yaml') {
        return resolve(true);
      }
    }
    const text = document.getText();
    try {
      linterCache
        .getLinter(document.uri)
        .then((linter: Spectral) => {
          const linterOptions: IRunOpts = {
            resolve: { documentUri: document.uri.toString() },
          };
          return linter.runWithResolved(text, linterOptions);
        })
        .then((fullResults: ISpectralFullResult) => {
          const results = fullResults.results;
          const resultBag = groupWarningsBySource(results, document.uri);
          eventEmitter.fire(resultBag);
          resultBag.forEach((warnings, source) => {
            const ourUri = vscode.Uri.parse(source);
            dc.delete(ourUri);
            if (warnings && warnings.length) {
              const diagnostics = [];
              for (const warning of warnings) {
                let range;
                if (!warning.path || clampRanges) {
                  range = new vscode.Range(
                    warning.range.start.line,
                    warning.range.start.character,
                    warning.range.start.line,
                    256,
                  );
                } else {
                  range = new vscode.Range(
                    warning.range.start.line,
                    warning.range.start.character,
                    warning.range.end.line,
                    warning.range.end.character,
                  );
                }
                const diagnostic = new vscode.Diagnostic(range, warning.message, ourSeverity(warning.severity));
                diagnostic.code = warning.code; // constructor is a bit limited
                diagnostic.source = 'spectral';
                diagnostics.push(diagnostic);
              }
              dc.set(ourUri, diagnostics);
            }
          });
          return resolve(resultBag);
        })
        .catch((ex: Error) => {
          let message = 'Spectral: Encountered error linting document\n';
          message += ex.message;
          vscode.window.showErrorMessage(message);
          eventEmitter.fire(ex);
          return reject(ex);
        });
    } catch (ex) {
      vscode.window.showErrorMessage('Spectral: Could not parse document as JSON or YAML');
      console.warn(ex.message);
      eventEmitter.fire(ex);
      return reject(ex);
    }
  });
}

function validateCurrentDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Spectral: You must have an open editor window to lint your document.');
    return; // No open text editor
  }

  return validateDocument(editor.document, true);
}

function queueValidateDocument(document: vscode.TextDocument, expectedOas: boolean) {
  const languageId = document.languageId;
  if (languageId !== 'yaml' && languageId !== 'json') {
    return false;
  }
  if (documentChangeTimeout !== null) {
    clearTimeout(documentChangeTimeout);
  }
  documentChangeTimeout = setInterval(() => {
    clearTimeout(documentChangeTimeout);
    return validateDocument(document, expectedOas);
  }, vscode.workspace.getConfiguration('spectral').get('lintOnSaveTimeout') || LINT_ON_SAVE_TIMEOUT);
}

// this method is called when your extension is activated
// your extension is activated at VsCode startup
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Spectral: Extension activated.');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('extension.spectral-lint', () => {
    // The code you place here will be executed every time your command is executed
    return validateCurrentDocument();
  });

  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      return validateDocument(document, false);
    }),
  );
  console.log('Spectral: Installed save handler');

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(changeEvent => {
      return queueValidateDocument(changeEvent.document, false);
    }),
  );
  console.log('Spectral: Installed on-type handler');

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      linterCache.purgeDocumentUri(document.uri);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      linterCache.purgeCaches();
    }),
  );

  const configWatcher1 = vscode.workspace.createFileSystemWatcher('**/spectral{.yaml,.yml,.json}', false, false, false);
  const configWatcher2 = vscode.workspace.createFileSystemWatcher(
    '**/.spectral{.yaml,.yml,.json}',
    false,
    false,
    false,
  );

  configWatcher1.onDidCreate(() => {
    linterCache.purgeCaches();
  });
  configWatcher1.onDidChange(() => {
    linterCache.purgeCaches();
  });
  configWatcher1.onDidDelete(() => {
    linterCache.purgeCaches();
  });

  configWatcher2.onDidCreate(() => {
    linterCache.purgeCaches();
  });
  configWatcher2.onDidChange(() => {
    linterCache.purgeCaches();
  });
  configWatcher2.onDidDelete(() => {
    linterCache.purgeCaches();
  });

  // you can return an API from your extension for use in other extensions
  // or tests etc
  return ourAPI;
}

// this method is called when your extension is deactivated
export function deactivate() {
  return true;
}
