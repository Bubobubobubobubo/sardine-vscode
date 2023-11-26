"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripAnsi = exports.ansiRegex = void 0;
const ansiRegex = ({ onlyFirst = false } = {}) => {
    /**
     * Returns a regular expression that matches ANSI escape codes.
     * @param onlyFirst - If true, the regular expression will only match the first occurrence. Default is false.
     * @returns A regular expression object.
     */
    const pattern = [
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
    ].join("|");
    return new RegExp(pattern, onlyFirst ? undefined : "g");
};
exports.ansiRegex = ansiRegex;
const stripAnsi = (expression) => {
    /**
     * Removes ANSI escape codes from a given string.
     *
     * @param expression - The string to remove ANSI escape codes from.
     * @returns The string without ANSI escape codes.
     * @throws TypeError if the input is not a string.
     */
    if (typeof expression !== "string") {
        throw new TypeError(`Expected a \`string\`, got \`${typeof expression}\``);
    }
    const regex = (0, exports.ansiRegex)();
    return expression.replace(regex, "");
};
exports.stripAnsi = stripAnsi;
//# sourceMappingURL=ansi.js.map