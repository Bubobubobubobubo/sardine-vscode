# Sardine VSCode extension

This is a Visual Studio Code extension for [Sardine](https://sardine.raphaelforment.fr). This extension is largely based on [vscode-foxdot](https://github.com/yasuyuky/vscode-foxdot). The extension is capable of:
- starting `sardine`.
- sending lines or blocks of code to the interpreter.
- shutting down itself (?)

## Commands

- `sardine.start`: automatically run whenever you eval a line for the first time. 
- `sardine.stop`: killing the interpreter subprocess.
- `sardine.silence`: Sardine silence function.
- `sardine.panic`: Sardine panic function.
- `sardine.send`: sending line to the interpreter.
- `sardine.send_selection`: sending lines to the interpreter.

## Requirements

You will need to install [Sardine](https://sardine.raphaelforment.fr) in order to make it work. Please note that `sardine` needs to be on your $PATH for the extension to work.
You will have to make it available if it is not. It should be if you have installed Sardine correctly.

## Settings

TODO

## Credits

- Yasuyuki YAMADA for the [original FoxDot extension](https://github.com/yasuyuky/vscode-foxdot)
