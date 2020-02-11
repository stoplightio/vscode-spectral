import * as cp from 'child_process';
import * as path from 'path';

import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from 'vscode-test';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.40.1');
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
    const testWorkspace = path.resolve(__dirname, '../../src/test/fixtures');

    // Use cp.spawn / cp.exec for custom setup
    cp.spawnSync(cliPath, ['--install-extension', 'redhat.vscode-yaml'], {
      encoding: 'utf-8',
      stdio: 'inherit',
    });

    // Download VS Code, unzip it and run the integration test
    await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, launchArgs: [testWorkspace] });
  } catch (err) {
    console.error('Failed to run tests', err.message);
    process.exit(1);
  }
}

// tslint:disable-next-line: no-floating-promises
main();
