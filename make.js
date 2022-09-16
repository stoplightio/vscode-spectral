#!/usr/bin/env node
/* global mkdir, pushd, popd, rm, target, cp */
'use strict';

require('shelljs/make');
const fs = require('fs').promises;
const path = require('path');
const ncp = require('child_process');
const semver = require('semver');

const packageJsonPath = path.join(__dirname, 'package.json');

/** Build output paths. */
const outputPath = {
  artifacts: path.join(__dirname, 'artifacts'),
  dist: path.join(__dirname, 'dist'),
  log: path.join(__dirname, 'artifacts', 'log'),
};

target.allDev = async () => {
  banner('Target: AllDev');

  const backupPath = await patchPackageJsonUpdateVersion();

  try {
    await target.package();
  } finally {
    await revertToOriginalPackageJson(backupPath);
  }
  e2e();
};

target.package = async () => {
  banner('Target: Package');

  await buildAll();

  pushd(outputPath.dist);
  run(`${path.join(__dirname, './node_modules/.bin/vsce')} package -o ${outputPath.artifacts}`);
  popd();
};

target.publish = async (args) => {
  if (!args || !args.length || args.length !== 1) {
    console.log('node make.js publish -- yourpublishtoken');
    return;
  }

  const token = args[0].trim();
  const vsixFiles = (await fs.readdir(outputPath.artifacts, { withFileTypes: true }))
    .filter((f) => !f.isDirectory())
    .filter((f) => f.name.endsWith('.vsix'));
  if (!vsixFiles || !vsixFiles.length) {
    console.log(`No .vsix found in the '${outputPath.artifacts}' folder.`);
    return;
  }

  if (vsixFiles.length > 1) {
    console.log(`More than one .vsix found in the '${outputPath.artifacts}' folder.`);
    return;
  }

  // https://code.visualstudio.com/api/working-with-extensions/publishing-extension
  runYarn(`vsce publish --packagePath ${path.join(outputPath.artifacts, vsixFiles[0].name)} -p ${token}`);
};

const buildAll = async () => {
  banner('Target: BuildAll');
  clean();
  run('yarn');
  runYarn('lint');
  test();
  await prepublish();
};

const clean = () => {
  banner('Target: Clean');
  runYarn('clean');
};

const prepublish = async () => {
  banner('Target: PrePublish');
  try {
    await fs.access(outputPath.artifacts);
  } catch (err) {
    mkdir(outputPath.artifacts);
  }

  runYarn(`webpack --mode production --stats errors-warnings --config ./client/webpack.config.js`);
  runYarn(`webpack --mode production --stats errors-warnings --config ./server/webpack.config.js`);

  await preparePackageStructure();
};

const e2e = () => {
  banner('Target: e2e tests');
  runYarn('test:e2e');
};

const test = () => {
  banner('Target: Test');
  runYarn('test');
};

/**
 * Writes a visible banner with top/bottom bars for build logging.
 * @param {string} message - The message to display.
 */
function banner(message) {
  console.log();
  console.log('------------------------------------------------------------');
  console.log(message);
  console.log('------------------------------------------------------------');
}

/**
 * Executes a command in a child process.
 * @param {string} cl - The command line to execute.
 * @param {boolean} capture - True to capture and return the output; false to simply echo to console.
 * @return {string|undefined} The output from the command.
 */
function run(cl, capture = false) {
  console.log();
  console.log('> ' + cl);

  let output;
  try {
    // Exec needs to be synchronous or tasks continue on without waiting for the
    // external process to finish. It gets weird.
    const options = {
      stdio: capture ? 'pipe' : 'inherit',
    };
    output = ncp.execSync(cl, options);
  } catch (err) {
    console.error(err.output ? err.output.toString() : err.message);
    throw err;
  }

  return (output || '').toString().trim();
}

/**
 * Executes a command in a child process.
 * @param {string} cl - The command line to execute.
 * @return {undefined} The output from the command.
 */
function runYarn(cl) {
  return run(`yarn --ignore-engines --silent ${cl}`);
}

/**
 * Temporarily patches the package.json version
 * in order to make local integration testing easier
 */
async function patchPackageJsonUpdateVersion() {
  const now = Math.floor(Date.now() / 1000);

  const backupPath = `${packageJsonPath}.${now}`;

  console.log(`Backing up "package.json" to "${backupPath}"`);
  cp(packageJsonPath, backupPath);

  const packageJsonContent = await fs.readFile(packageJsonPath, { encoding: 'utf8' });
  const jsonPackage = JSON.parse(packageJsonContent);
  const current = jsonPackage.version;
  const version = semver.parse(current);
  version.patch = now;
  version.inc('prerelease', 'dev');
  const next = version.toString();

  console.log(`Temporarily patching "package.json" version from "${current}" to "${next}"`);
  jsonPackage.version = next;

  await fs.writeFile(packageJsonPath, JSON.stringify(jsonPackage, undefined, 2));

  return backupPath;
}

/**
 * Reverts patched package.json file
 * @param {string} backupPath - The path to the original "package.json" file.
 */
async function revertToOriginalPackageJson(backupPath) {
  console.log('Restoring original "package.json" file');
  cp(backupPath, packageJsonPath);

  console.log(`Removing temporary backup "${backupPath}" file`);
  rm(backupPath);
}

/**
 * Prepare package structure
 */
function preparePackageStructure() {
  console.log(`Generating package tree structure in "${outputPath.dist}"`);

  mkdir(outputPath.dist);

  const distClient = path.join(outputPath.dist, 'client');
  mkdir(distClient);
  const distServer = path.join(outputPath.dist, 'server');
  mkdir(distServer);

  cp(path.join(__dirname, 'package.json'), outputPath.dist);
  cp(path.join(__dirname, 'README.md'), outputPath.dist);
  cp(path.join(__dirname, 'CHANGELOG.md'), outputPath.dist);
  cp(path.join(__dirname, 'LICENSE.txt'), outputPath.dist);
  cp(path.join(__dirname, 'icon.png'), outputPath.dist);

  cp(path.join(__dirname, 'client', 'dist', 'index.js'), distClient);
  cp(path.join(__dirname, 'server', 'dist', 'index.js'), distServer);
}
