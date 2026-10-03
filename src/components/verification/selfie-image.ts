import { fitWithin, SELFIE_MAX_SIDE } from "@/services/verification";

/**
 * Cashfree Phase 2 — the selfie as it is sent: a JPEG whose longest side is
 * at most 1280 px, drawn fresh from whatever the camera or the file gave.
 * Nothing is kept: the decoded picture is closed and the canvas dropped the
 * moment the JPEG exists, and the caller sends that and lets it go.
 */
export async function selfieJpeg(source: Blob): Promise<Blob> {
    const picture = await decode(source);
    try {
        const { width, height } = fitWithin(picture.width, picture.height, SELFIE_MAX_SIDE);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot prepare the photo. Try another browser.");
        context.drawImage(picture.image, 0, 0, width, height);
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        canvas.width = 0;
        canvas.height = 0;
        if (!jpeg) throw new Error("Could not prepare the photo. Take it again.");
        return jpeg;
    } finally {
        picture.close();
    }
}

interface Decoded {
    image: CanvasImageSource;
    width: number;
    height: number;
    close: () => void;
}

/** The picture, decoded: an ImageBitmap where the browser has one (honouring the photo's rotation), an <img> otherwise. */
async function decode(source: Blob): Promise<Decoded> {
    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
        return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(source);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("That file is not a photo ADX can read. Use a JPG or PNG."));
            element.src = url;
        });
        return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (caught) {
        URL.revokeObjectURL(url);
        throw caught;
    }
}
