// @ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');

module.exports = withDefaults({
  context: path.join(__dirname),
  entry: {
    index: './src/server.ts',
  },
  resolve: {
    mainFields: ['module', 'main'],
    alias: {
      'fsevents': false,
    },
  },
  output: {
    path: path.join(__dirname, 'dist'),
  },
});
