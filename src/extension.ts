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
  if (!sardineProc || sardineProc.killed) {
    vscode.window.showErrorMessage("Sardine process unavailable.");
    return;
  }
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
  sardineStatus.text = "Sardine";
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

function findSardine(): string {
  let customPath = vscode.workspace.getConfiguration("sardine").get<string>("pythonPath") || "";
  if (customPath) {
    if (customPath.endsWith("/sardine")) return customPath;
    else return customPath + "/sardine";
  }
  return "sardine";
}

// function selectPython(config: vscode.WorkspaceConfiguration): string {
//   let rootPath = vscode.workspace.rootPath || "";
//   let venvPath = path.join(rootPath, config.get<string>("venvPath") || "");
//   let venvPython = path.join(venvPath, "bin", "python");
//   let directPath = config.get<string>("pythonPath") || "";
//   if (venvPath && existsSync(venvPython)) return venvPython;
//   else if (directPath) return directPath;
//   return "python";
// }

function start(editor: TextEditor) {
  if (sardineProc && !sardineProc.killed) return;
  let config = vscode.workspace.getConfiguration("sardine");
  vscode.languages.setTextDocumentLanguage(editor.document, "python");
  feedbackStyle = config.get("feedbackStyle") || FeedbackStyle.outputChannel;
  let pythonPath = findSardine();
  // vscode.window.showInformationMessage("Using: " + pythonPath);
  startProcess(pythonPath);
  setupStatus();
  setupOutput();
  vscode.window.showInformationMessage(
    `Sardine has started with: ${vscode.workspace.getConfiguration("sardine").get<string>("pythonPath") || "defaultPath"}`);
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
  if (code) vscode.window.showErrorMessage(`Sardine has exited: ${code}.`);
  else vscode.window.showInformationMessage(`Sardine has stopped.`);
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
  for (const s of editor.selections) {
    let t = editor.document.getText(s);
    printFeedback(">>> " + t);
    sardineProc.stdin?.write(t + "\n\n");
  }
  editor.selections = editor.selections.map(
    (s) => new Selection(s.active, s.active)
  );
}

export function deactivate() {
  stop();
}