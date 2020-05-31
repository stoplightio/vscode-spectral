/* global mkdir, rm, target, cp */
'use strict';

require('shelljs/make');
const fs = require('fs').promises;
const path = require('path');
const ncp = require('child_process');
const jsonpath = require('jsonpath');
const semver = require('semver');

const packageJsonPath = path.join(__dirname, 'package.json');

/** Build output paths. */
const outputPath = {
  artifacts: path.join(__dirname, 'artifacts'),
  log: path.join(__dirname, 'artifacts', 'log'),
};

target.allDev = async () => {
  banner('Target: AllDev');
  const backupPath = await patchPackageJsonVersion();
  await target.all();
  await revertToOriginalPackageJson(backupPath);
};

target.all = async () => {
  banner('Target: All');
  target.clean();
  target.compile();
  target.test();
  await target.package();
};

target.clean = () => {
  banner('Target: Clean');
  run('yarn clean');
};

target.compile = () => {
  banner('Target: Compile');
  run('yarn');
  run('yarn lint');
  run('yarn compile');
};

target.package = async () => {
  banner('Target: Package');
  try {
    await fs.access(outputPath.artifacts);
  } catch (err) {
    mkdir(outputPath.artifacts);
  }

  rm('-rf', 'client/*.packed.js');
  rm('-rf', 'server/*.packed.js');
  run(`node node_modules/webpack-cli/bin/cli.js --config ./client/webpack.config.js`);
  await generateServerPackagingReports();

  run(`yarn vsce package -o ${outputPath.artifacts}`);
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
    console.log('No .vsix found in the artifacts folder.');
    return;
  }

  // https://code.visualstudio.com/api/working-with-extensions/publishing-extension
  run(`yarn vsce publish --packagePath ${path.join(outputPath.artifacts, vsixFiles[0].name)} -p ${token}`);
};

target.test = () => {
  banner('Target: Test');
  run('yarn test');
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
    process.exit(1);
  }

  return (output || '').toString().trim();
}

/**
 * Generates reports to help 'manually webpack' the server plugin.
 */
async function generateServerPackagingReports() {
  run(`node node_modules/webpack-cli/bin/cli.js --config ./server/webpack.config.js --profile --json > ${outputPath.artifacts}/server-modules.json`);
  console.log('Generating the list of modules used by the server.');
  const serverModules = require(`${outputPath.artifacts}/server-modules.json`);
  const names = jsonpath
    .query(serverModules, '$..name')
    .filter((v) => v.indexOf('node_modules') >= 0)
    .map((v) => v.replace(/.*node_modules\/([^/]+).*/, '$1'))
    .filter((v, i, a) => a.indexOf(v) === i) // unique items
    .sort();

  await fs.writeFile(path.join(outputPath.artifacts, 'server-module-names.txt'), names.join('\n'));

  console.log('Generating potential .vscodeignore items for server.');
  const potentialIgnores = [];
  const serverNodeModules = await fs.readdir(path.join(__dirname, 'server', 'node_modules'), { withFileTypes: true });
  serverNodeModules.filter((v) => v.isDirectory())
    .map((v) => v.name)
    .filter((v) => names.indexOf(v) === -1)
    .forEach((v) => {
      potentialIgnores.push(`server/node_modules/${v}`);
    });

  await fs.writeFile(path.join(outputPath.artifacts, 'server-vscodeignore.txt'), potentialIgnores.join('\n'));
}

/**
 * Temporarily patches the package.json version
 * in order to make local integration testing easier
 */
async function patchPackageJsonVersion() {
  const now = Math.floor(Date.now()/1000);

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
