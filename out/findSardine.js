"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSardine = exports.appendSardinePath = void 0;
// @ts-ignore
const vscode = require("vscode");
const child_process = require("child_process");
const appendSardinePath = (path) => {
    /**
     * Appends "/sardine" to the given path if it doesn't already end with it.
     * @param path - The path to append "/sardine" to.
     * @returns The modified path.
     */
    return path.endsWith("/sardine") ? path : path + "/sardine";
};
exports.appendSardinePath = appendSardinePath;
const findSardine = () => {
    /**
     * Finds the path to the Sardine executable.
     *
     * @returns The path to the Sardine executable, or undefined if not found.
     */
    const config = vscode.workspace.getConfiguration("sardine");
    const sardinePath = config.get("sardinePath");
    if (sardinePath) {
        return (0, exports.appendSardinePath)(sardinePath);
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
        }
        catch (error) {
            if (sardinePath)
                return (0, exports.appendSardinePath)(sardinePath);
        }
    }
    vscode.window.showErrorMessage("Please enter a valid Sardine Path in configuration and restart VSCode");
    return undefined;
};
exports.findSardine = findSardine;
//# sourceMappingURL=findSardine.js.map