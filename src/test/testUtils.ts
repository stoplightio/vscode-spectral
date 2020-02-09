import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const TEST_BASE = '../../src/test/fixtures';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function jsonReplacer(this: any, key: string, value: any) {
  const originalObject = (this as any)[key];
  if (originalObject instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(originalObject.entries()),
    };
  } else if (typeof value === 'string' && value.indexOf('/src/test/fixtures/') > -1) {
    // we need to sanitise paths as they differ between environments
    return value.split('/src/test/')[1];
  } else {
    return value;
  }
}

export function compare(filename: string, actual: object, suffix: string, message: string) {
  const outputFile = path.resolve(__dirname, TEST_BASE, filename) + '.' + suffix + '.json';
  const outputExists = fs.existsSync(outputFile);
  if (!outputExists) {
    fs.writeFileSync(outputFile, JSON.stringify(actual, jsonReplacer, 2), 'utf8');
  }
  const expected = JSON.parse(JSON.stringify(require(outputFile), jsonReplacer));
  const actualPP = JSON.parse(JSON.stringify(actual, jsonReplacer));
  assert.deepStrictEqual(actualPP, expected, message);
}
