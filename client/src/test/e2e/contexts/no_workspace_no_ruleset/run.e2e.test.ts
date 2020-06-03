/* eslint-disable require-jsdoc */

import { expect } from 'chai';
import * as chaiJestSnapshot from 'chai-jest-snapshot';
import * as vscode from 'vscode';
import * as path from 'path';

import { openFile, activate, retrieveOutputChannelId, readFromOutputChannelId } from '../../helper';

let outputChannelId: vscode.Uri;

suiteSetup(async () => {
  chaiJestSnapshot.resetSnapshotRegistry();
  await activate();
  outputChannelId = await (retrieveOutputChannelId());
});

setup(function() {
  // eslint-disable-next-line no-invalid-this
  chaiJestSnapshot.configureUsingMochaContext(this);
});

suite('No workspace, no ruleset', () => {
  suite('Output channel', () => {
    test('Contains Spectral version', async () => {
      const content = await readFromOutputChannelId(outputChannelId);
      expect(content).to.contain('Spectral v5.5.0-beta8 server running (Node.js v12.');
    });
  });

  suite('No diagnostics for empty files', () => {
    ['empty.yaml', 'empty.json'].forEach((fixture) => {
      test(`${fixture}`, async () => {
        const diags = await lint(['empty', fixture]);
        expect(diags).to.matchSnapshot();
      });
    });
  });

  suite('No diagnostics for valid files', () => {
    ['simple.yaml', 'simple.json'].forEach((fixture) => {
      test(`${fixture}`, async () => {
        const diags = await lint(['valid', fixture]);
        expect(diags).to.matchSnapshot();
      });
    });
  });

  suite('Invalid files trigger generation of diagnostics', () => {
    ['simple.yaml', 'simple.json'].forEach((fixture) => {
      test(`${fixture}`, async () => {
        const diags = await lint(['invalid', fixture]);

        expect(diags).to.matchSnapshot();
      });
    });
  });

  const pathToFixtures = '../../fixtures';

  const lint = async (pathSegments: string[]) => {
    const docPath = path.resolve(__dirname, pathToFixtures, ...pathSegments);

    const docUri = vscode.Uri.file(docPath);
    await openFile(docUri);

    return vscode.languages.getDiagnostics(docUri);
  };
});
