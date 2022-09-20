/* eslint-disable require-jsdoc */

import { expect } from 'chai';
import * as chaiJestSnapshot from 'chai-jest-snapshot';
import * as vscode from 'vscode';
import * as path from 'path';

import { openFile, activate, setRulesetFile, setValidateFiles } from '../../helper';
import { workspace } from 'vscode';

suiteSetup(async () => {
  chaiJestSnapshot.resetSnapshotRegistry();
  setRulesetFile('');
  setValidateFiles([
    '**/*.yaml',
    '!**/simple-ignore.yaml',
    '!**/package.json',
    '!**/template.cfn.yaml',
  ]);
  await activate();
});

setup(function() {
  // eslint-disable-next-line no-invalid-this
  chaiJestSnapshot.configureUsingMochaContext(this);
});

suite('Workspace, basic ruleset negative globs', () => {
  suite('Invalid files trigger generation of diagnostics but only if not ignored', () => {
    ['simple.yaml', 'simple.json', 'package.json', 'template.cfn.yaml', 'simple-ignore.yaml'].forEach((fixture) => {
      test(`${fixture}`, async () => {
        const diags = await lint(['invalid', fixture]);

        expect(diags).to.matchSnapshot();
      });
    });
  });

  const lint = async (pathSegments: string[]) => {
    const docPath = path.resolve(workspace.rootPath as string, ...pathSegments);

    const docUri = vscode.Uri.file(docPath);
    await openFile(docUri);

    return vscode.languages.getDiagnostics(docUri);
  };
});
