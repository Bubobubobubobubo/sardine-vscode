# Sardine VSCode extension

This is a Visual Studio Code extension for [Sardine](https://sardine.raphaelforment.fr). Consider it as a work in progress. This extension can:

- start/stop a `sardine` live coding session.
- send line(s) to the interpreter easily.
- display logs and errors.

Some keys are configured by default but use your favorite keybindings and be mindful of possible conflicts with other packages/extensions.

## Commands

- `sardine.start`: automatically run whenever you eval a line for the first time.
- `sardine.stop`: killing the interpreter subprocess.
- `sardine.silence`: Sardine silence function.
- `sardine.panic`: Sardine panic function.
- `sardine.send`: sending line to the interpreter.
- `sardine.send_selection`: sending lines to the interpreter.

## Requirements

To use this extension, you will need to install [Sardine](https://sardine.raphaelforment.fr) first. The `sardine` program needs to be on your `$PATH`. This is the condition for VSCode to be able to find it.

## Credits

- Yasuyuki YAMADA for the [original FoxDot extension](https://github.com/yasuyuky/vscode-foxdot)
