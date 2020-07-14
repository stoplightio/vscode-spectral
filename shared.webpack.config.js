'use strict';

const path = require('path');
const merge = require('merge-options');

module.exports = function withDefaults(extConfig) {
  const defaultConfig = {
    mode: 'none',
    target: 'node',
    node: {
      __dirname: false,
    },
    resolve: {
      mainFields: ['module', 'main'],
      extensions: ['.js'],
    },
    externals: {
      'vscode': 'commonjs vscode',
    },
    output: {
      filename: '[name].js',
      path: path.join(extConfig.context, 'wbpkd'),
      libraryTarget: 'commonjs',
    },
    devtool: 'source-map',
  };

  return merge(defaultConfig, extConfig);
};
