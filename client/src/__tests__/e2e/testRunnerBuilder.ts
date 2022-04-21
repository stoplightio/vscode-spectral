/* eslint-disable require-jsdoc */
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import * as vscode from 'vscode';
import * as chai from 'chai';
import * as chaiJestSnapshot from 'chai-jest-snapshot';

chai.use(chaiJestSnapshot);

export function testRunnerBuilder(testsRoot: string): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
  });

  mocha.timeout(10 * 1000);

  return new Promise((resolve, reject) => {
    glob('**/**.e2e.test.{ts,js}', { cwd: testsRoot }, (err, files) => {
      if (err) {
        reject(err);
      }

      // Add files to the test suite
      files.forEach((f) => {
        const testFile = path.resolve(testsRoot, f);
        console.info(`Enlisting test file '${testFile}'`);
        mocha.addFile(testFile);
      });

      try {
        vscode.window.showInformationMessage('Running tests...');

        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        console.error('Fatal error: ' + err);
        reject(err);
      }
    });
  });
}
