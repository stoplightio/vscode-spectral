/* eslint-disable valid-jsdoc, require-jsdoc */
import * as vscode from 'vscode';

export const activate = async (): Promise<void> => {
  // TODO: extract that from the package.json file
  const ext = vscode.extensions.getExtension('stoplight.spectral');

  if (ext === undefined) {
    throw new Error('Unable to activate the extension');
  }

  await ext.activate();

  console.info(`Extension '${ext.id}' v${ext.packageJSON.version} has been successfully activated.`);
};

export const setRulesetFile = (rulesetFile: string): void => {
  vscode.workspace.getConfiguration('spectral')
    .update('rulesetFile', rulesetFile, true, false);
};

export const setValidateFiles = (validateFiles: string[]): void => {
  vscode.workspace.getConfiguration('spectral')
    .update('validateFiles', validateFiles, true, false);
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isOutputPanel = (uri: vscode.Uri) => {
  return uri.toString().startsWith('output:extension-output-');
};

export const retrieveOutputChannelId = async (): Promise<vscode.Uri> => {
  await vscode.commands.executeCommand('spectral.showOutputChannel');
  await sleep(2000); // Wait for pannel to show

  const outputs = vscode.workspace.textDocuments
    .filter((d) => isOutputPanel(d.uri));

  if (outputs.length !== 1) {
    throw new Error('Unable to retrieve the Spectral output channel');
  }

  return outputs[0].uri;
};

export const readFromOutputChannelId = async (outputChannelId: vscode.Uri): Promise<string> => {
  await sleep(2000); // Give time to refresh
  const x = await vscode.workspace.openTextDocument(outputChannelId);
  return x.getText();
};

export const openFile = async (docUri: vscode.Uri): Promise<void> => {
  const doc = await vscode.workspace.openTextDocument(docUri);
  await vscode.window.showTextDocument(doc);

  await sleep(2000); // Wait for server activation
};
