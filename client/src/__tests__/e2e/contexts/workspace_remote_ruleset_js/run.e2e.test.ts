/* eslint-disable require-jsdoc */

import { expect } from 'chai';
import * as chaiJestSnapshot from 'chai-jest-snapshot';
import * as vscode from 'vscode';
import * as path from 'path';

import { openFile, activate, setRulesetFile, setValidateFiles } from '../../helper';
import { workspace } from 'vscode';

import * as httpTestServers from 'http-test-servers';

// set up our remote rules url using http-test-servers
const responseBody = `import { oas } from '@stoplight/spectral-rulesets';

var _migratedRuleset = {
  "extends": oas,
  "rules": {
    "oas3-schema": "hint",
    "info-contact": "off"
  }
};

export { _migratedRuleset as default };
`;

const routes = {
  spectralJs: {
    route: '/.spectral.js',
    method: 'get',
    statusCode: 200,
    response: responseBody,
  },
};

const servers = {
  spectralJs: {
    port: 3006,
    delay: 1000,
  },
};
const testServers = httpTestServers(routes, servers);

suiteSetup(async () => {
  await testServers.start(() => {
    console.log('Staring test servers on port 3006...');
  });
  chaiJestSnapshot.resetSnapshotRegistry();
  setRulesetFile('http://localhost:3006/.spectral.js');
  setValidateFiles([]);

  await activate();
});

setup(function() {
  // eslint-disable-next-line no-invalid-this
  chaiJestSnapshot.configureUsingMochaContext(this);
});

suiteTeardown(async () => {
  await testServers.kill(() => {
    console.log('Test servers stopped.');
  });
});

suite('Workspace, remote ruleset js', () => {
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

  const lint = async (pathSegments: string[]) => {
    const docPath = path.resolve(workspace.rootPath as string, ...pathSegments);

    const docUri = vscode.Uri.file(docPath);
    await openFile(docUri);

    return vscode.languages.getDiagnostics(docUri);
  };
});
