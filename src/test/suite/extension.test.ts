// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { DiagnosticSeverity } from '@stoplight/types';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as utils from '../../utils';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Diagnostic severity test', () => {
    assert.equal(vscode.DiagnosticSeverity.Error, utils.ourSeverity(DiagnosticSeverity.Error));
    assert.equal(vscode.DiagnosticSeverity.Hint, utils.ourSeverity(DiagnosticSeverity.Hint));
    assert.equal(vscode.DiagnosticSeverity.Information, utils.ourSeverity(DiagnosticSeverity.Information));
    assert.equal(vscode.DiagnosticSeverity.Warning, utils.ourSeverity(DiagnosticSeverity.Warning));
  });
});
