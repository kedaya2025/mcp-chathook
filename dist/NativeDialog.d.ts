/**
 * Shows a native desktop dialog using Windows mshta.exe (HTA).
 *
 * Why mshta: IE rendering engine handles DPI natively → sharp text.
 * Why JScript (not VBScript): proper string handling, no encoding bugs.
 * Data exchange: Base64 (pure ASCII) → zero encoding risk.
 *
 * On non-Windows, falls back to terminal stdin.
 */
export declare function showNativeDialog(message: string, suggestions?: string[]): Promise<{
    action: "accept" | "cancel";
    text: string;
}>;
