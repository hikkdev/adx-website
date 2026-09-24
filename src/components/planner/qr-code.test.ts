import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeQr, qrSvgDocument } from "./qr-code";

/**
 * The encoder against the backend's `qrcode` library (the engine's local
 * fallback): the same text in byte mode, level M and mask give the same
 * matrix, module for module. The reference rows are hashed so the vectors stay short.
 */
const VECTORS: { text: string; mask: number; version: number; size: number; sha: string }[] = [
    { text: "https://asterhome.example/festive?utm_source=adx&utm_medium=ooh&utm_campaign=aster-festive-oct26&utm_content=whitefield-billboard", mask: 0, version: 8, size: 49, sha: "1c3c19ed88a8c38149fbf1312e283c3be1f7fee40fad9fef7a933bbe7477b0c4" },
    { text: "https://asterhome.example/festive?utm_source=adx&utm_medium=ooh&utm_campaign=aster-festive-oct26&utm_content=whitefield-billboard", mask: 3, version: 8, size: 49, sha: "9a87ffc5f6049711feec8be517a7055961bc95c96a69de0314fa403be00f64a3" },
    { text: "https://asterhome.example/festive?utm_source=adx&utm_medium=ooh&utm_campaign=aster-festive-oct26&utm_content=whitefield-billboard", mask: 7, version: 8, size: 49, sha: "59f1b5e8884de52adf1c44459c06bc99009df01762a7e94bcd700c5b80d9c229" },
    { text: "http://a.b/", mask: 0, version: 1, size: 21, sha: "a6f130bb57442bf419288f830f7d1c26080c5a51f6e70be422440d926ac7e100" },
    { text: "http://a.b/", mask: 3, version: 1, size: 21, sha: "2b4299e2c305b64fb18d54ab54d6a0c54f9bd332eeffc7bfbd07fab1c3283367" },
    { text: "http://a.b/", mask: 7, version: 1, size: 21, sha: "63bb956fdc5a41884b69ff383a4d1e922d6fae31ee8b769ea1e7d1e920c2a43f" },
    { text: "Hello, world! 1234567890 ₹", mask: 0, version: 3, size: 29, sha: "fae98c643da96f600461d1ba77b755387d532a5ae68cfd8adc75ef08ac44bd62" },
    { text: "Hello, world! 1234567890 ₹", mask: 3, version: 3, size: 29, sha: "2a5c7fe92efdea8ec1e26141ce3733b007a1717e2d1e514ba58a98da1153fd14" },
    { text: "Hello, world! 1234567890 ₹", mask: 7, version: 3, size: 29, sha: "2df70227e988ebabf3bc5267f6c542d9e9c162762ffed0a66f66ec928e263a69" },
];

function rowsOf(matrix: { size: number; modules: boolean[][] }): string {
    return matrix.modules.map((row) => row.map((m) => (m ? "1" : "0")).join("")).join("|");
}

describe("the QR encoder", () => {
    it.each(VECTORS)("matches the reference library for $text with mask $mask", ({ text, mask, version, size, sha }) => {
        const matrix = encodeQr(text, "M", mask);
        expect(matrix).not.toBeNull();
        expect(matrix!.version).toBe(version);
        expect(matrix!.size).toBe(size);
        expect(createHash("sha256").update(rowsOf(matrix!)).digest("hex")).toBe(sha);
    });

    it("chooses a mask on its own and renders an SVG", () => {
        const matrix = encodeQr("https://adx.in/t/ABCD1234");
        expect(matrix?.size).toBe(25);
        const svg = qrSvgDocument("https://adx.in/t/ABCD1234", 256);
        expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"');
        expect(encodeQr("x".repeat(2000))).toBeNull();
    });
});
