// @ts-ignore
import * as vscode from "vscode";
import * as child_process from "child_process";


export const appendSardinePath = (path: string): string => {
  /**
   * Appends "/sardine" to the given path if it doesn't already end with it.
   * @param path - The path to append "/sardine" to.
   * @returns The modified path.
   */
  return path.endsWith("/sardine") ? path : path + "/sardine";
};

export const findSardine = (): string | undefined => {
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