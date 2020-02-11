import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { IRuleResult } from '@stoplight/spectral';
import * as vscode from 'vscode';
import { IExtensionAPI } from '../../extension';
import { compare } from '../testUtils';

const CMD_SPECTRAL_LINT = 'extension.spectral-lint';
const CMD_CLOSE_EDITOR = 'workbench.action.closeActiveEditor';
const SLOW_TIMEOUT_MS = 5000;
const TEST_BASE = '../../../src/test/fixtures';

suite('Integration Test Suite', () => {
  let extensionApi: IExtensionAPI;

  test('check vscode started ok', () => {
    assert.ok(vscode.workspace, 'check for vscode.workspace');
    assert.ok(vscode.window, 'check for vscode.window');
    vscode.window.showInformationMessage('Start all integration tests.');
  });

  test('Should start extension @integration', () => {
    const ext = vscode.extensions.getExtension('stoplight.spectral');
    assert.ok(ext);
    const started = ext!.isActive;
    assert.equal(started, true);
    extensionApi = ext!.exports;
  });

  test('extensionApi should have notificationEmitter property', () => {
    assert.ok(extensionApi);
    assert.ok(extensionApi.hasOwnProperty('notificationEmitter'));
    assert.ok(extensionApi.notificationEmitter instanceof vscode.EventEmitter);
  });

  test('extension should contribute Spectral commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    const lint = commands.find(command => {
      return command === CMD_SPECTRAL_LINT;
    });
    assert.equal(lint, CMD_SPECTRAL_LINT, 'check for lint command');
  });

  test('lint a plaintext file', async () => {
    return new Promise(async (resolve, reject) => {
      const plaintextPath = path.resolve(__dirname, TEST_BASE, 'plaintext.txt');
      const plaintextUri = vscode.Uri.parse(plaintextPath);
      await vscode.workspace.openTextDocument(plaintextUri).then(
        async (doc: vscode.TextDocument) => {
          assert.equal(doc.languageId, 'plaintext', 'Expected languageId: plaintext');
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            const result = await vscode.commands.executeCommand(CMD_SPECTRAL_LINT);
            try {
              assert.ok(result, 'Expected a lint result');
              // because we are invoking the manual command, the extension assumes the
              // document needs linting (regardless of languageId) and will return
              // a resultBag. This is not the case for lint-on-type which bails early
              // if the document is not json or yaml, or if it fails all the registered
              // is... functions
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('plaintext.txt', resultBag, 'int', 'Compare result');
              resolve(result);
            } catch (ex) {
              reject(ex);
            }
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('lint a compliant JSON example', async () => {
    return new Promise(async (resolve, reject) => {
      const testPath = path.resolve(__dirname, TEST_BASE, 'lintable.json');
      const testUri = vscode.Uri.parse(testPath);
      await vscode.workspace.openTextDocument(testUri).then(
        async (doc: vscode.TextDocument) => {
          assert.equal(doc.languageId, 'json', 'Expected languageId: json');
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('lintable.json', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('lint a minimal OAS3 example', async () => {
    return new Promise(async (resolve, reject) => {
      const minimalPath = path.resolve(__dirname, TEST_BASE, 'openapi.yaml');
      const minimalUri = vscode.Uri.parse(minimalPath);
      await vscode.workspace.openTextDocument(minimalUri).then(
        async (doc: vscode.TextDocument) => {
          assert.equal(doc.languageId, 'yaml', 'Expected languageId: yaml');
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('openapi.yaml', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('lint a minimal OAS2 example', async () => {
    return new Promise(async (resolve, reject) => {
      const minimalPath = path.resolve(__dirname, TEST_BASE, 'swagger.yaml');
      const minimalUri = vscode.Uri.parse(minimalPath);
      await vscode.workspace.openTextDocument(minimalUri).then(
        async (doc: vscode.TextDocument) => {
          assert.equal(doc.languageId, 'yaml', 'Expected languageId: yaml');
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('swagger.yaml', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('Test rules loading 1 (foo)', async () => {
    return new Promise(async (resolve, reject) => {
      const testPath = path.resolve(__dirname, TEST_BASE, 'rules', 'foo', 'openapi.yaml');
      const testUri = vscode.Uri.parse(testPath);
      await vscode.workspace.openTextDocument(testUri).then(
        async (doc: vscode.TextDocument) => {
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('rules/foo/openapi.yaml', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('Test rules loading 2 (foo/bar)', async () => {
    return new Promise(async (resolve, reject) => {
      const testPath = path.resolve(__dirname, TEST_BASE, 'rules', 'foo', 'bar', 'openapi.yaml');
      const testUri = vscode.Uri.parse(testPath);
      await vscode.workspace.openTextDocument(testUri).then(
        async (doc: vscode.TextDocument) => {
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('rules/foo/bar/openapi.yaml', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('Test rules loading 3 (bar)', async () => {
    return new Promise(async (resolve, reject) => {
      const testPath = path.resolve(__dirname, TEST_BASE, 'rules', 'bar', 'openapi.yaml');
      const testUri = vscode.Uri.parse(testPath);
      await vscode.workspace.openTextDocument(testUri).then(
        async (doc: vscode.TextDocument) => {
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('rules/bar/openapi.yaml', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);

  test('Test rules loading 4 (baz)', async () => {
    return new Promise(async (resolve, reject) => {
      const testPath = path.resolve(__dirname, TEST_BASE, 'rules', 'baz', 'openapi.yaml');
      const testUri = vscode.Uri.parse(testPath);
      await vscode.workspace.openTextDocument(testUri).then(
        async (doc: vscode.TextDocument) => {
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(async e => {
            await vscode.commands.executeCommand(CMD_SPECTRAL_LINT).then(result => {
              assert.ok(result, 'Expected a lint result');
              assert.ok(result instanceof Map, 'Check type of lint result');
              const resultBag = result as Map<string, IRuleResult[]>;
              compare('rules/baz/openapi.yaml', resultBag, 'int', 'Compare results');
              resolve(result);
            });
          });
          vscode.commands.executeCommand(CMD_CLOSE_EDITOR);
        },
        (error: any) => {
          reject(error);
        },
      );
    });
  }).timeout(SLOW_TIMEOUT_MS);
});
