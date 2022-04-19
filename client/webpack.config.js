// @ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');

module.exports = withDefaults({
  context: path.join(__dirname),
  entry: {
    index: './src/extension.ts',
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
  },
  output: {
    path: path.join(__dirname, 'dist'),
  },
});
