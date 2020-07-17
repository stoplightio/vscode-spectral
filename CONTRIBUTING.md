# Spectral for VS Code - Building

## Tools

- [VS Code](https://code.visualstudio.com/)
- [Node.js](https://nodejs.org/)

## Developing

There are suggested extensions for the workspace, check those out By going to the Extensions pane in VS Code and looking at `@recommended` extensions.

The top-level build script `make.js` uses [the `shelljs/make` utility](https://github.com/shelljs/shelljs/wiki/The-make-utility) to build, test, and package at the top level. This runs through Node.

```powershell
# Just checked out, restore packages!
yarn

# Full clean, compile, test, package and e2e tests cycle (for local testing only).
# This will build a dev .vsix file which version will always be greater than the
# latest published one and can be locally installed for local testing.
node make.js allDev

# Clean, compile, test and generate the ready to be published production .vsix
# file in the artifacts folder.
node make.js package

# Publish the extension to the marketplace (requires the .vsix file to already exists).
node make.js publish -- <pat>

# List all the targets to see what you can do.
node make.js --help
```

The client portion of the plugin is webpacked.

The server portion is not because of the dynamic way Spectral loads its rulesets. It tries to use `require.resolve` on a dynamically calculated ruleset path, which loads a JSON file, which itself has additional `.js` files it points to that need to be resolved using that dynamic `require.resolve`. If it fails to find the files, it falls back to using `unpkg.com`, but it doesn't cache the results. If you have a bad net connection or unpkg is misbehaving, you're hosed.

I couldn't figure out how to get the rulesets to properly load but webpack "everything else." I'd love a PR if someone is better at webpack than I am.

In the meantime, we use webpack to do some tree-shaking and analyze what actually gets used. The results get processed into some files dumped in the artifacts folder at package time, and those are used to dynamically generate the proper `.vscodeignore` file.
