import * as vscode from "vscode";
import {
  TextEditor,
  Selection,
  StatusBarItem,
  StatusBarAlignment,
  OutputChannel,
} from "vscode";
import { spawn, ChildProcess } from "child_process";
import { stripAnsi } from "./ansi";
import * as util from "util";
import * as child_process from "child_process";

enum FeedbackStyle {
  outputChannel,
  infomationMessage,
}

let sardineProc: ChildProcess;
let sardineStatus: StatusBarItem;
let sardineOutput: OutputChannel;
let feedbackStyle: FeedbackStyle;
let outputHooks: Map<string, (s: string) => any> = new Map();

export function activate(context: vscode.ExtensionContext) {
  /**
   * Activates the extension.
   *
   * @param context The extension context.
   */
  let commands = new Map<string, (...args: any[]) => any>([
    ["sardine.start", start],
    ["sardine.send", send],
    ["sardine.silence", silence],
    ["sardine.panic", panic],
    ["sardine.sendSelections", sendSelections],
    ["sardine.stop", stop],
  ]);

  for (const [key, func] of commands)
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(key, func)
    );
}

function startProcess(command: string) {
  /**
   * Starts a process with the given command.
   * @param command - The command to execute.
   */
  sardineProc = spawn(command, [], {
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      sclang:
        vscode.workspace
          .getConfiguration("sardine")
          .get<string>("sclangPath") || "sclang",
    },
  });
  sardineProc.on("error", (err) => {
    vscode.window.showErrorMessage(`Sardine error: ${err.message}`);
  });
  sardineProc.stdout?.on("data", handleOutputData);
  sardineProc.stderr?.on("data", handleErrorData);
  sardineProc.on("close", handleOnClose);
}

const silence = () => {
  /**
   * Writes "silence()" to the standard input of the sardineProc.
   */
  sardineProc.stdin!.write("silence()\n\n");
};

const panic = () => {
  /**
   * Writes "panic()" to the standard input of the sardineProc.
   */
  sardineProc.stdin!.write("panic()\n\n");
};

const setupStatus = () => {
  /**
   * Sets up the status bar item for the Sardine plugin.
   */
  sardineStatus = vscode.window.createStatusBarItem(
    StatusBarAlignment.Left,
    10
  );
  sardineStatus.text = "$(triangle-right) Sardine";
  sardineStatus.tooltip = "Click to open Sardine documentation";
  sardineStatus.command = "extension.openSardineDocs";
  sardineStatus.show();
};

const setupOutput = () => {
  /**
   * Sets up the output channel for Sardine.
   */
  sardineOutput = vscode.window.createOutputChannel("Sardine");
  sardineOutput.show(true);
};

const setOutputHook = (key: string, handler: (_: string) => any) => {
  /**
   * Sets an output hook for a specific key.
   *
   * @param key - The key associated with the output hook.
   * @param handler - The handler function to be called when the output hook is triggered.
   */
  outputHooks?.set(key, (s) => {
    handler(s.slice(key.length));
    outputHooks.delete(key);
  });
};

const appendSardinePath = (path: string): string => {
  /**
   * Appends "/sardine" to the given path if it doesn't already end with it.
   * @param path - The path to append "/sardine" to.
   * @returns The modified path.
   */
  return path.endsWith("/sardine") ? path : path + "/sardine";
};

const findSardine = (): string | undefined => {
  /**
   * Finds the path to the Sardine executable.
   *
   * @returns The path to the Sardine executable, or undefined if not found.
   */
  const config = vscode.workspace.getConfiguration("sardine");
  const sardinePath = config.get<string>("sardinePath");

  if (sardinePath) {
    return appendSardinePath(sardinePath);
  }

  if (process.platform === "linux" || process.platform === "darwin") {
    try {
      const whichSardine = child_process
        .execSync("which sardine")
        .toString()
        .trim();
      if (whichSardine) {
        return whichSardine;
      }
    } catch (error) {
      if (sardinePath) return appendSardinePath(sardinePath);
    }
  }
  vscode.window.showErrorMessage(
    "Please enter a valid Sardine Path in configuration and restart VSCode"
  );
  return undefined;
};

const start = (editor: TextEditor): Promise<void> => {
  /**
   * Starts the Sardine extension by initializing the necessary components and starting the Sardine process.
   *
   * @param editor The TextEditor instance representing the active editor.
   * @returns A Promise that resolves when the Sardine extension has started successfully, or rejects with an
   *  error if there was an issue starting the extension.
   */
  return new Promise(async (resolve, reject) => {
    try {
      if (sardineProc && !sardineProc.killed) {
        resolve();
        return;
      }

      let config = vscode.workspace.getConfiguration("sardine");
      vscode.languages.setTextDocumentLanguage(editor.document, "python");
      feedbackStyle =
        config.get("feedbackStyle") || FeedbackStyle.outputChannel;
      let sardinePath = findSardine();
      if (!sardinePath) {
        vscode.window.showInformationMessage(
          `Can't start without Sardine path.`
        );
        reject(new Error("Sardine path not defined"));
        return;
      }

      sardineProc = spawn(sardinePath, [], {
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
      });

      sardineProc.on("spawn", () => {
        console.log("Sardine process started.");
      });

      sardineProc.on("exit", (code) => {
        console.log(`Sardine process exited with code ${code}`);
      });

      sardineProc.on("error", (err) => {
        vscode.window.showErrorMessage(`Sardine error: ${err.message}`);
        reject(err);
      });

      sardineProc.stdout?.on("data", (data) => {
        printFeedback(data.toString());
        resolve();
      });

      setupStatus();
      setupOutput();
      vscode.window.showInformationMessage(
        `Sardine has started with: ${sardinePath}`
      );
    } catch (error) {
      reject(error);
    }
  });
};

const printFeedback = (s: string) => {
  /**
   * Prints the feedback message.
   *
   * @param s - The feedback message to be printed.
   */
  const strippedString = stripAnsi(s);
  switch (feedbackStyle) {
    case FeedbackStyle.infomationMessage:
      vscode.window.showInformationMessage(strippedString);
      break;
    default:
      sardineOutput.appendLine(strippedString);
      break;
  }
};

const handleOutputData = (data: any) => {
  const s: string = data.toString();
  for (const [k, f] of outputHooks) if (s.startsWith(k)) return f(s);
  printFeedback(s);
};

const handleErrorData = (data: any) => {
  printFeedback(data.toString());
};

const handleOnClose = (code: number) => {
  /**
   * Handles the onClose event of the Sardine plugin.
   * @param code The exit code of Sardine.
   */

  if (code !== 0) {
    vscode.window.showErrorMessage(`Sardine has exited: ${code}.`);
  } else {
    vscode.window.showInformationMessage(`Sardine has stopped.`);
  }
  sardineStatus?.dispose();
};

const stop = () => {
  sardineProc.kill();
};

const selectCursorsContexts = (editor: TextEditor) => {
  /**
   * Modifies the selections in the editor to include additional context lines.
   * The context lines are determined by including non-empty and non-whitespace
   * lines * above and below the original selection range.
   *
   * @param editor The TextEditor instance representing the editor.
   */
  editor.selections = editor.selections.map((s) => {
    let [d, sl, el] = [editor.document, s.start.line, s.end.line];
    let r = d.lineAt(sl).range.union(d.lineAt(el).range);
    for (let l = sl; l >= 0 && !d.lineAt(l).isEmptyOrWhitespace; l--)
      r = r.union(d.lineAt(l).range);
    for (let l = el; l < d.lineCount && !d.lineAt(l).isEmptyOrWhitespace; l++)
      r = r.union(d.lineAt(l).range);
    return new Selection(r.start, r.end);
  });
};

const send = async (editor: TextEditor) => {
  /**
   * Sends the selected text to Sardine for processing.
   * If Sardine is not running, it will be started first.
   * @param editor The text editor containing the selected text.
   */
  if (!sardineProc || sardineProc.killed) {
    console.log("Sardine is not running, starting it...");
    await start(editor);
    console.log("Sardine started.");
  }
  selectCursorsContexts(editor);
  await sendSelections(editor);
};

const sendSelections = async (editor: TextEditor) => {
  /**
   * Sends the selected text from the editor to the Sardine process.
   *
   * @param editor The TextEditor containing the selected text.
   */
  for (const s of editor.selections) {
    let t = editor.document.getText(s);
    try {
      if (!sardineProc || !sardineProc.stdin) {
        throw new Error("Sardine process is not running.");
      }

      printFeedback(">>> " + t);
      sardineProc.stdin?.write(t + "\n\n");

      editor.selections = editor.selections.map(
        (s) => new Selection(s.active, s.active)
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(
          `Error sending selection: ${error.message}`
        );
      } else {
        vscode.window.showErrorMessage(
          `An unexpected error occurred while sending selections.`
        );
      }
    }
  }
};

vscode.commands.registerCommand("extension.openSardineDocs", () => {
  /**
   * Opens the Sardine documentation in the default browser.
   */
  vscode.env.openExternal(
    vscode.Uri.parse("https://sardine.raphaelforment.fr")
  );
});
