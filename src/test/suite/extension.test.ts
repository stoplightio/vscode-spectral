// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as linter from '../../linter';
import * as utils from '../../utils';

import { IRunOpts, ISpectralFullResult } from '@stoplight/spectral';
import { DiagnosticSeverity } from '@stoplight/types';

const SLOW_TIMEOUT_MS = 5000;
const TEST_BASE = '../../../src/test/fixtures';
const linterProvider = new linter.LinterCache();

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Diagnostic severity test', () => {
    assert.equal(vscode.DiagnosticSeverity.Error, utils.ourSeverity(DiagnosticSeverity.Error));
    assert.equal(vscode.DiagnosticSeverity.Hint, utils.ourSeverity(DiagnosticSeverity.Hint));
    assert.equal(vscode.DiagnosticSeverity.Information, utils.ourSeverity(DiagnosticSeverity.Information));
    assert.equal(vscode.DiagnosticSeverity.Warning, utils.ourSeverity(DiagnosticSeverity.Warning));
  });

  test('Linting a plaintext document', () => {
    return new Promise(async (resolve, reject) => {
      const plaintextPath = path.resolve(__dirname, TEST_BASE, 'plaintext.txt');
      const plaintextUri = vscode.Uri.parse(plaintextPath);
      const plaintextContents = fs.readFileSync(plaintextPath, 'utf8');
      try {
        const spectral = await linterProvider.getLinter(plaintextUri);
        const linterOptions: IRunOpts = {
          resolve: { documentUri: plaintextUri.toString() },
        };
        const output = await spectral.runWithResolved(plaintextContents, linterOptions);
        assert.ok(output.hasOwnProperty('resolved'), 'Check for output.resolved');
        assert.ok(output.hasOwnProperty('results'), 'Check for output.results');
        assert.equal(output.results.length, 1, 'Should be one result');
        assert.equal(output.results[0].code, 'unrecognized-format', 'Check result code');
        resolve(output);
      } catch (ex) {
        reject(ex);
      }
    });
  }).timeout(SLOW_TIMEOUT_MS);
});
