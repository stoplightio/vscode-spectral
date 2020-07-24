/* global mkdir, pushd, popd, rm, target, cp */
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
  dist: path.join(__dirname, '.dist'),
  log: path.join(__dirname, 'artifacts', 'log'),
};

target.allDev = async () => {
  banner('Target: AllDev');

  const backupPath = await patchPackageJsonVersion();
  await target.package();
  await revertToOriginalPackageJson(backupPath);
  e2e();
};

target.package = async () => {
  banner('Target: Package');

  await buildAll();

  pushd(outputPath.dist);
  run(`yarn vsce package -o ${outputPath.artifacts}`);
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
  run(`yarn vsce publish --packagePath ${path.join(outputPath.artifacts, vsixFiles[0].name)} -p ${token}`);
};

const buildAll = async () => {
  banner('Target: BuildAll');
  clean();
  compile();
  test();
  await prepublish();
};

const clean = () => {
  banner('Target: Clean');
  run('yarn clean');
};

const compile = () => {
  banner('Target: Compile');
  run('yarn');
  run('yarn lint');
  run('yarn compile');
};

const prepublish = async () => {
  banner('Target: PrePublish');
  try {
    await fs.access(outputPath.artifacts);
  } catch (err) {
    mkdir(outputPath.artifacts);
  }

  run(`node node_modules/webpack-cli/bin/cli.js --mode production --config ./client/webpack.config.js`);

  preparePackageStructure();

  await generateServerPackagingReports();
};

const e2e = () => {
  banner('Target: e2e tests');
  run(`yarn test:e2e`);
};

const test = () => {
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
  // Deletes the .mjs file from decimal.js because because Webpack messes up the VSIX when it's present. Deleting it fixes the issue
  // This seems related: https://github.com/MikeMcl/decimal.js/issues/59"
  run('yarn rimraf server/node_modules/decimal.js/decimal.mjs');

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
      potentialIgnores.push(`server/node_modules/${v}/`);
    });

  await fs.writeFile(path.join(outputPath.artifacts, 'server-vscodeignore.txt'), potentialIgnores.join('\n'));
  await fs.appendFile(path.join(outputPath.dist, '.vscodeignore'), potentialIgnores.join('\n'));
}

/**
 * Temporarily patches the package.json version
 * in order to make local integration testing easier
 */
async function patchPackageJsonVersion() {
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

  cp(path.join(__dirname, 'tools', '.vscodeignore'), outputPath.dist);

  cp(path.join(__dirname, 'package.json'), outputPath.dist);

  pushd(outputPath.dist);
  run('yarn install --no-lockfile --ignore-scripts');
  popd();

  const distClient = path.join(outputPath.dist, 'client');
  mkdir(distClient);
  const distServer = path.join(outputPath.dist, 'server');
  mkdir(distServer);

  cp(path.join(__dirname, 'README.md'), outputPath.dist);
  cp(path.join(__dirname, 'CHANGELOG.md'), outputPath.dist);
  cp(path.join(__dirname, 'LICENSE.txt'), outputPath.dist);
  cp(path.join(__dirname, 'icon.png'), outputPath.dist);

  cp(path.join(__dirname, 'client', 'wbpkd', 'index.js'), distClient);
  cp(path.join(__dirname, 'server', 'out', '*.js'), distServer);
  cp(path.join(__dirname, 'server', 'package.json'), distServer);
  cp(path.join(__dirname, 'server', 'yarn.lock'), distServer);

  // Install the server node_modules, filtering as much as possible all the useless cruft
  cp(path.join(__dirname, 'tools', '.yarnclean'), distServer);
  pushd(distServer);
  run('yarn --frozen-lockfile --offline --production');
  rm(path.join(distServer, '.yarnclean'));
  rm(path.join(distServer, 'node_modules', '.yarn-integrity'));
  rm(path.join(distServer, 'yarn.lock'));
  popd();
}
