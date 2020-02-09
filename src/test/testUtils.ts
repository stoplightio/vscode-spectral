import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const TEST_BASE = '../../src/test/fixtures';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function mapReplacer(this: any, key: string, value: any) {
  const originalObject = (this as any)[key];
  if (originalObject instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(originalObject.entries()),
    };
  } else {
    return value;
  }
}

export function compare(filename: string, actual: object, suffix: string, message: string) {
  const outputFile = path.resolve(__dirname, TEST_BASE, filename) + '.' + suffix + '.json';
  const outputExists = fs.existsSync(outputFile);
  if (!outputExists) {
    fs.writeFileSync(outputFile, JSON.stringify(actual, mapReplacer, 2), 'utf8');
  }
  const expected = require(outputFile);
  const actualPP = JSON.parse(JSON.stringify(actual, mapReplacer));
  assert.deepStrictEqual(actualPP, expected, message);
}
