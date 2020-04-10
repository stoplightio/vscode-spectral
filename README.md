# Spectral README

The Spectral VS Code Extension brings the power of [Spectral](https://github.com/stoplightio/spectral) to your favorite editor.

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

* Install from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=stoplight.spectral) 
* Install via the CLI: `code --install-extension stoplight.spectral`
* Create a `.vsix` bundle using vsce (`npm install -g vsce`)  with `vsce package` and `code --install-extension {vsix filename}`

## Development

* Clone the [GitHub](https://github.com/stoplightio/vscode-spectral/) repository
* Run `yarn`
* Open the folder where you cloned the repository in VS Code
* Start the included debugging configuration

Please run `yarn run lint` and `yarn run test` before creating any pull-requests.

## Extension Settings

This extension contributes the following settings:

* `spectral.lintOnSaveTimeout`: Delay in ms before linting, default: `2000`
* `spectral.defaultRuleset`: Default ruleset URI, default: `spectral:oas`
* `spectral.clampRanges`: Minimize range highlighted by errors and warnings, default: `true`

## Known Issues / Limitations

If you open a single file in VS Code (as opposed to opening a folder or
workspace), then [Spectral rulesets](https://stoplight.io/p/docs/gh/stoplightio/spectral/docs/getting-started/rulesets.md) `(.?spectral.{yml|yaml|json}` files) will
not be found, even if they are in the same directory. This is due to the use
of the recommended/performant VS Code APIs for finding and watching files,
which are exclusively workspace-based.

## Thanks

- [Mike Ralphson](https://github.com/MikeRalphson)
- [Travis Illig](https://github.com/tillig)

## License

[Apache-2.0](./LICENSE)
