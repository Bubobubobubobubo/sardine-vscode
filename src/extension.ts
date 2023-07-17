import * as vscode from "vscode";
import {
  TextEditor,
  Selection,
  StatusBarItem,
  StatusBarAlignment,
  OutputChannel,
} from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as util from "util";
import * as child_process from 'child_process';

const ansiRegex = ({onlyFirst = false} = {}) => {
	const pattern = [
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))'
	].join('|');
	return new RegExp(pattern, onlyFirst ? undefined : 'g');
};

const stripAnsi = (expression: string ) => {
  if (typeof expression !== 'string') {
    throw new TypeError(`Expected a \`string\`, got \`${typeof expression}\``);

  }
  const regex = ansiRegex();
  return expression.replace(regex, '');
};

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
  sardineProc = spawn(command, [], {
    env: { 
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      sclang: vscode.workspace.getConfiguration("sardine").get<string>("sclangPath") || "sclang",
    }
  });
  sardineProc.on("error", (err) => {
    vscode.window.showErrorMessage(`Sardine error: ${err.message}`);
  });
  sardineProc.stdout?.on("data", handleOutputData);
  sardineProc.stderr?.on("data", handleErrorData);
  sardineProc.on("close", handleOnClose);
}

function silence(){
  sardineProc.stdin?.write("silence()\n\n");
}

function panic(){
  sardineProc.stdin?.write("panic()\n\n");
}

function setupStatus() {
  sardineStatus = vscode.window.createStatusBarItem(StatusBarAlignment.Left, 10);
  sardineStatus.text = "$(triangle-right) Sardine";
  sardineStatus.tooltip = "Click to open Sardine documentation";
  sardineStatus.command = "extension.openSardineDocs";
  sardineStatus.show();
}

function setupOutput() {
  sardineOutput = vscode.window.createOutputChannel("Sardine");
  sardineOutput.show(true);
}

function setOutputHook(key: string, handler: (_: string) => any) {
  outputHooks?.set(key, (s) => {
    handler(s.slice(key.length));
    outputHooks.delete(key);
  });
}

const sleep = (msec: number) => util.promisify(setTimeout)(msec);

function appendSardinePath(path: string): string {
  if (path.endsWith("/sardine")) {
    return path;
  } else {
    return path + "/sardine";
  }
}

function findSardine(): string | undefined {
  const config = vscode.workspace.getConfiguration("sardine");
  const sardinePath = config.get<string>('sardinePath');

  if (sardinePath) {
    return appendSardinePath(sardinePath);
  }

  if (process.platform === "linux" || process.platform === "darwin") {
    try {
      const whichSardine = child_process.execSync("which sardine").toString().trim();
      if (whichSardine) {
        return whichSardine;
      }
    } catch (error) {
      if (sardinePath) return appendSardinePath(sardinePath);
    }
  }
  vscode.window.showErrorMessage("Please enter a valid Sardine Path in configuration and restart VSCode");
  return undefined;
}

function start(editor: TextEditor) {
  if (sardineProc && !sardineProc.killed) return;
  let config = vscode.workspace.getConfiguration("sardine");
  vscode.languages.setTextDocumentLanguage(editor.document, "python");
  feedbackStyle = config.get("feedbackStyle") || FeedbackStyle.outputChannel;
  let sardinePath = findSardine();
  if (!sardinePath) {
    vscode.window.showInformationMessage(
    `Can't start without Sardine path.`);
    return
  }
  startProcess(sardinePath);
  setupStatus();
  setupOutput();
  vscode.window.showInformationMessage(
    `Sardine has started with: ${sardinePath}`);
}

function printFeedback(s: string) {
  const strippedString = stripAnsi(s);
  switch (feedbackStyle) {
    case FeedbackStyle.infomationMessage:
      vscode.window.showInformationMessage(strippedString);
      break;
    default:
      sardineOutput.appendLine(strippedString);
      break;
  }
}

function handleOutputData(data: any) {
  const s: string = data.toString();
  for (const [k, f] of outputHooks) if (s.startsWith(k)) return f(s);
  printFeedback(s);
}

function handleErrorData(data: any) {
  printFeedback(data.toString());
}

function handleOnClose(code: number) {
  if (code !== 0) {
    vscode.window.showErrorMessage(`Sardine has exited: ${code}.`);
  } else {
    vscode.window.showInformationMessage(`Sardine has stopped.`);
  }
  sardineStatus?.dispose();
}

function stop() {
  sardineProc.kill();
}

function selectCursorsContexts(editor: TextEditor) {
  editor.selections = editor.selections.map((s) => {
    let [d, sl, el] = [editor.document, s.start.line, s.end.line];
    let r = d.lineAt(sl).range.union(d.lineAt(el).range);
    for (let l = sl; l >= 0 && !d.lineAt(l).isEmptyOrWhitespace; l--)
      r = r.union(d.lineAt(l).range);
    for (let l = el; l < d.lineCount && !d.lineAt(l).isEmptyOrWhitespace; l++)
      r = r.union(d.lineAt(l).range);
    return new Selection(r.start, r.end);
  });
}

function send(editor: TextEditor) {
  selectCursorsContexts(editor);
  sendSelections(editor);
}

function sendSelections(editor: TextEditor) {
  const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 255, 0, 0.3)",
      isWholeLine: false,
      light: {
        backgroundColor: "rgba(255, 255, 0, 0.3)",
      },
      dark: {
        backgroundColor: "rgba(255, 255, 0, 0.3)",
      },
  });

  for (const s of editor.selections) {
    let t = editor.document.getText(s);
    printFeedback(">>> " + t);
    sardineProc.stdin?.write(t + "\n\n");

    // Add decoration
    const decoration = {
      range: s,
      renderOptions: {
        backgroundColor: "rgba(255, 255, 0, 0.3)",
        isWholeLine: false,
        before: {
          contentText: " ",
          backgroundColor: "rgba(255, 255, 0, 0.3)",
          border: "2px solid rgba(255, 255, 0, 0.8)",
          borderRadius: "5px",
          margin: "0 3px",
          width: "10px",
          height: "10px",
          animation: "blinking 1s ease-in-out infinite",
        },
      },
    };
    editor.setDecorations(decorationType, [decoration]);
  }

  setTimeout(() => {
    editor.setDecorations(decorationType, []);
  }, 400);


  editor.selections = editor.selections.map(
    (s) => new Selection(s.active, s.active)
  );
}

export function deactivate() {
  stop();
}

vscode.commands.registerCommand("extension.openSardineDocs", () => {
  vscode.env.openExternal(vscode.Uri.parse("https://sardine.raphaelforment.fr"));
});