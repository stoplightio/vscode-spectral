# Spectral README

The Spectral VsCode Extension brings the power of [Spectral](https://github.com/stoplightio/spectral) to your favorite editor.

Spectral is a flexible object linter with out of the box support for [OpenAPI](https://openapis.org/) v2 and v3.

## Features

* Lint-on-save
* Lint-on-type
* Custom ruleset support (`spectral` or `.spectral` files with `.json`, `.yaml` or `.yml` extensions)
* Intellisense for custom ruleset editing
* Support for JSON and YAML input

![screenshot](docs/images/screenshot1.png)

## Requirements

Visual Studio Code version 1.37 or higher.

## Installation

* Install from the Visual Studio Code Marketplace within VsCode, or
* `code --install-extension stoplight.spectral`, or
* Create a `.vsix` bundle using vsce (`npm install -g vsce`)  with `vsce package` and `code --install-extension {vsix filename}`

## Development

* Clone the [GitHub](https://github.com/stoplightio/vscode-spectral/) repository
* Run `yarn`
* Open the folder where you cloned the repository in VsCode
* Start the included debugging configuration

Please run `yarn run lint` and `yarn run test` before creating any pull-requests.

## Extension Settings

This extension contributes the following settings:

* `spectral.lintOnSaveTimeout`: Delay in ms before linting, default: `2000`
* `spectral.defaultRuleset`: Default ruleset URI, default: `spectral:oas`

## Known Issues

None.

## Release Notes

### 0.0.1

Initial pre-release of VsCode extension. Spectral v5.0.0

## License

[Apache-2.0](./LICENSE)
