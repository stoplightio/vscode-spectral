/* eslint-disable require-jsdoc */
import { testRunnerBuilder } from '../../testRunnerBuilder';

export function run(): Promise<void> {
  const testsRoot = __dirname;
  return testRunnerBuilder(testsRoot);
}
