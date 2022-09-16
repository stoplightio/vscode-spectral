const path = require('path');

require('ts-node').register({
  project: path.resolve(__dirname, '../../../../../tsconfig.json'),
  transpileOnly: true,
  typeCheck: false,
});

exports.run = require(path.resolve(__dirname, './configuration.ts')).run;
