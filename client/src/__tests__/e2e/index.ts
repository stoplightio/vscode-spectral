import * as path from 'path';
import { runTests, downloadAndUnzipVSCode } from 'vscode-test';
import { randomBytes } from 'crypto';

// The folder containing the Extension Manifest package.json
// Passed to `--extensionDevelopmentPath`
const extensionDevelopmentPath = path.resolve(__dirname, '../../../../dist');
console.info(`Loading extension from '${extensionDevelopmentPath}'`,);

interface TestCase {
  workspace?: string;
  testRunner: string;
}

(async (): Promise<void> => {
  const testCases: TestCase[] = [
    {
      testRunner: './contexts/no_workspace_no_ruleset/configuration',
      workspace: undefined,
    },
    {
      testRunner: './contexts/workspace_basic_ruleset/configuration',
      workspace: './workspaces/basic_ruleset/',
    },
    {
      testRunner: './contexts/workspace_basic_ruleset_negative_globs/configuration',
      workspace: './workspaces/basic_ruleset_negative_globs/',
    },
    {
      testRunner: './contexts/workspace_basic_ruleset_with_functions/configuration',
      workspace: './workspaces/basic_ruleset_with_functions/',
    },
    {
      testRunner: './contexts/workspace_remote_ruleset_json/configuration',
      workspace: './workspaces/remote_ruleset/',
    },
    {
      testRunner: './contexts/workspace_remote_ruleset_yaml/configuration',
      workspace: './workspaces/remote_ruleset/',
    },
    {
      testRunner: './contexts/workspace_remote_ruleset_js/configuration',
      workspace: './workspaces/remote_ruleset/',
    },
  ];

  try {
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.48.0');

    for (const tc of testCases) {
      console.info(`Using VSCode from '${vscodeExecutablePath}'`,);

      tc.testRunner = path.resolve(__dirname, tc.testRunner);
      console.info(`Using test runner from '${tc.testRunner}'`,);

      const launchArgs: string[] = [];

      if (tc.workspace !== undefined) {
        tc.workspace = path.resolve(__dirname, tc.workspace);
      } else {
        tc.workspace = `blank_${randomBytes(8).toString('hex')}`;
      }

      launchArgs.push(tc.workspace);

      console.info(`Using workspace '${tc.workspace}'`,);

      launchArgs.push('--disable-extensions');

      console.info(`Using launchArgs: ${JSON.stringify(launchArgs)}`);

      // Download VS Code, unzip it and run the integration test
      await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: tc.testRunner,
        launchArgs,
      });
    }
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
})();
