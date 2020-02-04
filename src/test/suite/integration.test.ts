import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';

suite('Integration Test Suite', () => {
  vscode.window.showInformationMessage('Start all integration tests.');

  test('Should start extension @integration', () => {
    const ext = vscode.extensions.getExtension('stoplight.spectral');
    assert.ok(ext);
    const started = ext!.isActive;
    assert.equal(started, true);
  });
});
