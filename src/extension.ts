// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { IRunOpts, isOpenApiv2, isOpenApiv3, ISpectralFullResult, Spectral } from '@stoplight/spectral';
import { parse } from '@stoplight/yaml';
import * as vscode from 'vscode';
import { Linter } from './linter';
import { groupWarningsBySource, ourSeverity } from './utils';

const LINT_ON_SAVE_TIMEOUT = 2000; // fallback value. If changed, also update package.json
const dc = vscode.languages.createDiagnosticCollection('spectral');
const lintProvider = new Linter();

let changeTimeout: NodeJS.Timeout;

function validateDocument(document: vscode.TextDocument, expectedOas: boolean) {
  const text = document.getText();
  try {
    if (!expectedOas) {
      const doc = parse(text);
      const isOas = isOpenApiv3(doc) || isOpenApiv2(doc);
      if (!isOas) {
        return true;
      }
    }
    lintProvider
      .getLinter(document)
      .then((linter: Spectral) => {
        const linterOptions: IRunOpts = {
          resolve: { documentUri: document.uri.toString() },
        };
        return linter.runWithResolved(text, linterOptions);
      })
      .then((fullResults: ISpectralFullResult) => {
        const results = fullResults.results;
        const resultBag = groupWarningsBySource(results, document.uri.toString());
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
      })
      .catch((ex: Error) => {
        let message = 'Spectral: Encountered error linting document\n';
        message += ex.message;
        vscode.window.showErrorMessage(message);
      });
  } catch (ex) {
    vscode.window.showErrorMessage('Spectral: Could not parse document as JSON or YAML');
    console.warn(ex.message);
  }
}

function validateCurrentDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Spectral: You must have an open editor window to lint your document.');
    return; // No open text editor
  }

  validateDocument(editor.document, true);
}

function queueValidateDocument(document: vscode.TextDocument, expectedOas: boolean) {
  if (changeTimeout !== null) {
    clearTimeout(changeTimeout);
  }
  changeTimeout = setInterval(() => {
    clearTimeout(changeTimeout);
    validateDocument(document, expectedOas);
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
    validateCurrentDocument();
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
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      // TODO recalculate Spectral instance cache
    }),
  );

  const roots = vscode.workspace.workspaceFolders;
  if (roots) {
    roots.forEach(value => {
      console.log(value.uri.toString());
    });
  }

  // you can return an API from your extension for use in other extensions
  // or tests etc
}

// this method is called when your extension is deactivated
export function deactivate() {
  return true;
}
