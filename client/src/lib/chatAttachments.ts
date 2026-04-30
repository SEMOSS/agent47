import { v4 as uuidv4 } from "uuid";
import type { PendingAttachment } from "@/store/slices/chatSlice";

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2200;
const MAX_NORMALIZE_ATTEMPTS = 6;

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
            }
            reject(new Error("Unable to read image data."));
        };
        reader.onerror = () => reject(new Error("Unable to read image data."));
        reader.readAsDataURL(blob);
    });

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Unable to decode image."));
        };
        image.src = objectUrl;
    });

const canvasToBlob = (
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality?: number,
): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }
                reject(new Error("Unable to encode image."));
            },
            mimeType,
            quality,
        );
    });

const normalizeFileName = (fileName: string, mimeType: string): string => {
    const baseName =
        fileName.replace(/\.[^.]+$/, "").trim() || "image";

    const extension =
        mimeType === "image/jpeg"
            ? "jpg"
            : mimeType === "image/webp"
              ? "webp"
              : "png";

    return `${baseName}.${extension}`;
};

export const normalizeImageAttachment = async (
    file: File,
): Promise<PendingAttachment> => {
    if (!file.type.startsWith("image/")) {
        throw new Error("Only image files are supported.");
    }

    const image = await loadImage(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Unable to prepare image preview.");
    }

    const preferredMimeType =
        file.type === "image/jpeg" || file.type === "image/webp"
            ? file.type
            : "image/png";

    let scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(image.width, image.height),
    );
    let mimeType = preferredMimeType;
    let quality =
        mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.92 : undefined;
    let outputBlob: Blob | null = null;
    let outputWidth = image.width;
    let outputHeight = image.height;

    for (let attempt = 0; attempt < MAX_NORMALIZE_ATTEMPTS; attempt += 1) {
        outputWidth = Math.max(1, Math.round(image.width * scale));
        outputHeight = Math.max(1, Math.round(image.height * scale));
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        context.clearRect(0, 0, outputWidth, outputHeight);
        context.drawImage(image, 0, 0, outputWidth, outputHeight);

        outputBlob = await canvasToBlob(canvas, mimeType, quality);

        if (outputBlob.size <= MAX_ATTACHMENT_SIZE_BYTES) {
            break;
        }

        if (mimeType === "image/png" && attempt === 1) {
            mimeType = "image/jpeg";
            quality = 0.88;
        } else if (quality && quality > 0.55) {
            quality = Math.max(0.55, quality - 0.1);
        } else {
            scale *= 0.8;
        }
    }

    if (!outputBlob || outputBlob.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new Error("Image is too large after normalization.");
    }

    return {
        id: uuidv4(),
        fileName: normalizeFileName(file.name || "image", mimeType),
        mimeType,
        dataUrl: await readBlobAsDataUrl(outputBlob),
        byteSize: outputBlob.size,
        width: outputWidth,
        height: outputHeight,
    };
};
