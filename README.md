# Spectral Linter for VS Code

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

* Node.js 12.13 or higher
* Visual Studio Code version 1.47 or higher.

## Installation

* Install from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=stoplight.spectral)
* Install via the CLI: `code --install-extension stoplight.spectral`

## Extension Settings

This extension contributes the following settings:

* `spectral.enable`: Controls whether or not Spectral is enabled.
* `spectral.rulesetFile`: Location of the ruleset file to use when validating. If omitted, the default is a `.spectral.yml`/`.spectral.json` in the same folder as the document being validated. Paths are relative to the workspace.
* `spectral.run`: Run the linter on save (`onSave`) or as you type (`onType`).
* `spectral.validateFiles`: An array of file globs (e.g., `**/*.yaml`) which should be validated by Spectral. If language identifiers are also specified, the file must match both in order to be validated.
* `spectral.validateLanguages`: An array of language IDs (e.g., `yaml`, `json`) which should be validated by Spectral. If file globs are also specified, the file must match both in order to be validated.

## Thanks

* [Mike Ralphson](https://github.com/MikeRalphson)
* [Travis Illig](https://github.com/tillig)

## License

[Apache-2.0](LICENSE.txt)
