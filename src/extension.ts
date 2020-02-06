// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { IRuleResult, IRunOpts, isOpenApiv2, isOpenApiv3, ISpectralFullResult, Spectral } from '@stoplight/spectral';
import { parse } from '@stoplight/yaml';
import * as vscode from 'vscode';
import { Linter } from './linter';
import { groupWarningsBySource, ourSeverity } from './utils';

declare type IEventData = Map<string, IRuleResult[]> | Error;
export interface IExtensionAPI {
  notificationEmitter: vscode.EventEmitter<IEventData>;
}

const LINT_ON_SAVE_TIMEOUT = 2000; // fallback value. If changed, also update package.json
const dc = vscode.languages.createDiagnosticCollection('spectral');
const ourAPI: IExtensionAPI = { notificationEmitter: new vscode.EventEmitter<IEventData>() };
const lintProvider = new Linter();

let changeTimeout: NodeJS.Timeout;

function validateDocument(document: vscode.TextDocument, expectedOas: boolean) {
  const text = document.getText();
  return new Promise((resolve, reject) => {
    try {
      if (!expectedOas) {
        const doc = parse(text);
        const isOas = isOpenApiv3(doc) || isOpenApiv2(doc);
        if (!isOas) {
          return resolve(true);
        }
      }
      lintProvider
        .getLinter(document.uri)
        .then((linter: Spectral) => {
          const linterOptions: IRunOpts = {
            resolve: { documentUri: document.uri.toString() },
          };
          return linter.runWithResolved(text, linterOptions);
        })
        .then((fullResults: ISpectralFullResult) => {
          const results = fullResults.results;
          const resultBag = groupWarningsBySource(results, document.uri.toString());
          ourAPI.notificationEmitter.fire(resultBag);
          resultBag.forEach((warnings, source) => {
            const ourUri = vscode.Uri.parse(source);
            dc.delete(ourUri);
            if (warnings && warnings.length) {
              const diagnostics = [];
              for (const warning of warnings) {
                const range = new vscode.Range(
                  warning.range.start.line,
                  warning.range.start.character,
                  warning.range.end.line,
                  warning.range.end.character,
                );
                diagnostics.push(
                  new vscode.Diagnostic(range, warning.message + ' ' + warning.code, ourSeverity(warning.severity)),
                );
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
          ourAPI.notificationEmitter.fire(ex);
          return reject(ex);
        });
    } catch (ex) {
      vscode.window.showErrorMessage('Spectral: Could not parse document as JSON or YAML');
      console.warn(ex.message);
      ourAPI.notificationEmitter.fire(ex);
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
  if (changeTimeout !== null) {
    clearTimeout(changeTimeout);
  }
  changeTimeout = setInterval(() => {
    clearTimeout(changeTimeout);
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
      lintProvider.purgeDocumentUri(document.uri);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      lintProvider.purgeCaches();
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
    lintProvider.purgeCaches();
  });
  configWatcher1.onDidChange(() => {
    lintProvider.purgeCaches();
  });
  configWatcher1.onDidDelete(() => {
    lintProvider.purgeCaches();
  });

  configWatcher2.onDidCreate(() => {
    lintProvider.purgeCaches();
  });
  configWatcher2.onDidChange(() => {
    lintProvider.purgeCaches();
  });
  configWatcher2.onDidDelete(() => {
    lintProvider.purgeCaches();
  });

  // you can return an API from your extension for use in other extensions
  // or tests etc
  return ourAPI;
}

// this method is called when your extension is deactivated
export function deactivate() {
  return true;
}
