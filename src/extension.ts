// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Spectral from '@stoplight/spectral';
import { httpAndFileResolver } from './resolver';
import { groupWarningsBySource } from './utils';
import { parseWithPointers } from '@stoplight/yaml';
import { ISpectralFullResult,
	IRunOpts,
	isOpenApiv2,
	isOpenApiv3,
	isJSONSchema,
	isJSONSchemaLoose,
	isJSONSchemaDraft4,
	isJSONSchemaDraft6,
	isJSONSchemaDraft7,
	isJSONSchemaDraft2019_09
} from '@stoplight/spectral';
import { IDiagnostic, DiagnosticSeverity } from '@stoplight/types';

const dc = vscode.languages.createDiagnosticCollection('spectral');

function ourSeverity(spectralSeverity:IDiagnostic["severity"]) {
	if (spectralSeverity === DiagnosticSeverity.Error) {
		return vscode.DiagnosticSeverity.Error;
  }
	if (spectralSeverity === DiagnosticSeverity.Warning) {
		return vscode.DiagnosticSeverity.Warning;
  }
	if (spectralSeverity === DiagnosticSeverity.Information) {
		return vscode.DiagnosticSeverity.Information;
  }
	return vscode.DiagnosticSeverity.Hint;
}

function validateDocument(document: vscode.TextDocument, expectedOas: boolean, resolve: boolean) {
	let text = document.getText();
	try {
		const linter = new Spectral.Spectral({ resolver: httpAndFileResolver });
		linter.registerFormat('oas2', isOpenApiv2);
		linter.registerFormat('oas3', isOpenApiv3);
		linter.registerFormat('json-schema', isJSONSchema);
		linter.registerFormat('json-schema-loose', isJSONSchemaLoose);
		linter.registerFormat('json-schema-draft4', isJSONSchemaDraft4);
		linter.registerFormat('json-schema-draft6', isJSONSchemaDraft6);
		linter.registerFormat('json-schema-draft7', isJSONSchemaDraft7);
		linter.registerFormat('json-schema-2019-09', isJSONSchemaDraft2019_09);
		if (!expectedOas) {
			const doc = parseWithPointers(text);
			const isOas = isOpenApiv3(doc.data) || isOpenApiv2(doc.data);
			if (!isOas) {
        return true;
      }
		}
		linter.loadRuleset('spectral:oas')
		.then(function () {
			const linterOptions: IRunOpts = { resolve: { documentUri: document.uri.toString() } };
			return linter.runWithResolved(text, linterOptions);
		})
		.then(function (fullResults: ISpectralFullResult) {
			const results = fullResults.results;
			const resultBag = groupWarningsBySource(results, document.uri.toString());
			resultBag.forEach(function(warnings, source){
				const ourUri = vscode.Uri.parse(source);
				dc.delete(ourUri);
				if (warnings && warnings.length) {
					const diagnostics = [];
					for (let warning of warnings) {
						let range = new vscode.Range(warning.range.start.line,warning.range.start.character,warning.range.end.line,warning.range.end.character);
						diagnostics.push(new vscode.Diagnostic(range, warning.message + ' ' + warning.code, ourSeverity(warning.severity)));
					}
					dc.set(ourUri, diagnostics);
				}
			});
		})
		.catch(function (ex: Error) {
			let message = 'Spectral: Encountered error linting document :( \n';
			message += ex.message;
			vscode.window.showErrorMessage(message);
		});
	}
	catch (ex) {
		vscode.window.showErrorMessage('Spectral: Could not parse document as JSON or YAML!');
		console.warn(ex.message);
	}
}

function validateCurrentDocument(resolve: boolean) {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('Spectral: You must have an open editor window to lint your document.');
		return; // No open text editor
	}

	if (resolve && editor.document.isUntitled) {
		vscode.window.showWarningMessage('Spectral: Document must be saved in order to resolve correctly.');
		return; // No open text editor
	}

	validateDocument(editor.document, true, resolve);
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
	let disposable = vscode.commands.registerCommand('extension.spectral-lint', () => {
		// The code you place here will be executed every time your command is executed
		validateCurrentDocument(false);
	});

	context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(function(document){
      return validateDocument(document, false, false);
    }));
    console.log('Spectral: Installed save handler');
    // you can return an API from your extension for use in other extensions
    // or tests etc
}

// this method is called when your extension is deactivated
export function deactivate() { }
