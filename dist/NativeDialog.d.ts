/**
 * Shows a native desktop dialog using Windows PowerShell + Windows.Forms.
 *
 * Encoding: triple-safe (PS1 BOM + Base64 text + Base64 result)
 * DPI: SetProcessDPIAware for sharp rendering
 *
 * On non-Windows platforms, falls back to a terminal-based prompt.
 */
export declare function showNativeDialog(message: string, suggestions?: string[]): Promise<{
    action: "accept" | "cancel";
    text: string;
}>;
