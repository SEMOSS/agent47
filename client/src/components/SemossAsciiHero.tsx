import { useEffect, useState } from "react";
import { AsciiArt } from "@/components/ui/ascii-art";

const SEMOSS_GREEN = "#5CB649";

function buildSemossImage(): string {
    const canvas = document.createElement("canvas");
    const w = 1200;
    const h = 400;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    // Draw SEMOSS in bold white so brightness maps to ASCII density
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 260px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Agent47", w / 2, h / 2);

    return canvas.toDataURL();
}

export const SemossAsciiHero = () => {
    const [dataUrl, setDataUrl] = useState<string>("");

    useEffect(() => {
        setDataUrl(buildSemossImage());
    }, []);

    if (!dataUrl) return null;

    return (
        <AsciiArt
            src={dataUrl}
            resolution={110}
            color={SEMOSS_GREEN}
            backgroundColor="transparent"
            animationStyle="matrix"
            animated={true}
            animateOnView={false}
            className="w-full h-full"
            objectFit="contain"
        />
    );
};
