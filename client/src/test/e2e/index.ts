import * as path from 'path';
import { runTests } from 'vscode-test';
import { randomBytes } from 'crypto';

// The folder containing the Extension Manifest package.json
// Passed to `--extensionDevelopmentPath`
const extensionDevelopmentPath = path.resolve(__dirname, '../../../../.dist');
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
    // {
    //   testRunner: './one_workspace_no_ruleset/configuration',
    //   workspace: '../../src/__e2e_tests__/one_workspace_no_ruleset/fixtures/',
    // },
  ];

  try {
    for (const tc of testCases) {
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
