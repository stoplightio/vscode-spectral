'use strict';

const merge = require('merge-options');

module.exports = function withDefaults(extConfig) {
  const defaultConfig = {
    mode: 'none',
    target: 'node',
    node: {
      __dirname: false,
    },
    resolve: {
      extensions: ['.ts', '.js', '.json'],
    },
    externals: {
      'vscode': 'commonjs2 vscode',
    },
    output: {
      filename: '[name].js',
      libraryTarget: 'commonjs2',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    devtool: false,
  };

  return merge(defaultConfig, extConfig);
};
