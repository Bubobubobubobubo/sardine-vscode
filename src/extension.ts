import * as vscode from "vscode";
import { findSardine } from "./findSardine";
import {
  TextEditor,
  Selection,
  StatusBarItem,
  StatusBarAlignment,
  OutputChannel,
} from "vscode";
import { spawn, ChildProcess, exec } from "child_process";
import { stripAnsi } from "./ansi";
import * as child_process from "child_process";

// Sardine CLI process
let sardineProc: ChildProcess;

// Sardine Status bar
let sardineStatus: StatusBarItem;

// Sardine output channels
let sardineOutput: OutputChannel;

// Styles
let feedbackStyle: FeedbackStyle;
let outputHooks: Map<string, (s: string) => any> = new Map();

enum FeedbackStyle {
  outputChannel,
  infomationMessage,
}


export function activate(context: vscode.ExtensionContext) {
  /**
   * Activates the extension (entry point).
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
    ["sardine.help", help],
  ]);

  for (const [key, func] of commands)
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(key, func)
    );
}

export function deactivate() {
  /**
   * Deactivates the extension.
   */
  stop();
}

function help(): void {
  /**
   * Opens the Sardine documentation in the default browser.
  */
  vscode.env.openExternal(
    vscode.Uri.parse("https://sardine.raphaelforment.fr")
  );
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

const start = (editor: TextEditor): Promise<void> => {
  /**
   * Starts the Sardine extension. 
   *
   * @param editor The TextEditor instance representing the active editor.
   * @returns A Promise that resolves when the Sardine extension has started 
   * successfully, or rejects with an error if there was an issue starting 
   * the extension.
   */
  return new Promise(async (resolve, reject) => {

    // Kill any process named "sardine" that is running
    exec('pkill -f "python.*sardine"', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });

    try {
      if (sardineProc && !sardineProc.killed) {
        sardineProc.kill();
        // Kill any process named "sardine" that is running
      }

      let config = vscode.workspace.getConfiguration("sardine");
      vscode.languages.setTextDocumentLanguage(editor.document, "python");
      feedbackStyle = config.get("feedbackStyle") || FeedbackStyle.outputChannel;
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
      let sardineProcID = sardineProc.pid;

      sardineProc.on("spawn", () => {
        console.log("Sardine process started.");
      });

      sardineProc.on("exit", (code) => {
        sardineProc.kill("SIGINT");
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

      sardineProc.stderr?.on("data", (data) => {
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

const printFeedback = (message: string) => {
  /**
   * Prints the feedback message with type indication.
   * @param message - The feedback message to be printed.
   * @param type - The type of the message ('stdout' or 'stderr').
   */
  const strippedMessage = stripAnsi(message);

  switch (feedbackStyle) {
    case FeedbackStyle.infomationMessage:
      vscode.window.showInformationMessage(strippedMessage);
      break;
    default:
      sardineOutput.appendLine(strippedMessage);
      break;
  }
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
  // Kill the Sardine process
  if (sardineProc && !sardineProc.killed) {
    sardineProc.kill();
  }

  // Dispose the status bar item
  if (sardineStatus) {
    sardineStatus.dispose();
  }

  // Clear the output channel
  if (sardineOutput) {
    sardineOutput.clear();
  }

  // Show a message to the user
  vscode.window.showInformationMessage('Sardine has stopped.');
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
