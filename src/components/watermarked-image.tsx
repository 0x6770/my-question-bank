"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WatermarkedImageProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  /** URL of the watermark image (logo) */
  watermarkSrc?: string;
  /** Fallback text if no image provided */
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkRotation?: number;
  /** Size of watermark logo in pixels */
  watermarkSize?: number;
  watermarkPattern?: "single" | "tiled";
  /** Spacing between tiled watermarks */
  watermarkSpacing?: number;
};

export function WatermarkedImage({
  src,
  alt,
  className = "",
  watermarkSrc,
  watermarkText = "MyQuestionBank",
  watermarkOpacity = 0.04,
  watermarkRotation = -20,
  watermarkSize = 700,
  watermarkPattern = "tiled",
  watermarkSpacing = 120,
}: WatermarkedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: 0,
    height: 0,
  });

  const drawTextWatermark = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      ctx.save();
      ctx.globalAlpha = watermarkOpacity;
      ctx.fillStyle = "#000000";
      ctx.font = "bold 24px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (watermarkPattern === "tiled") {
        const textWidth = ctx.measureText(watermarkText).width;
        const spacingX = textWidth + 80;
        const spacingY = 72;

        const diagonal = Math.sqrt(
          canvasWidth * canvasWidth + canvasHeight * canvasHeight,
        );
        const offsetX = (diagonal - canvasWidth) / 2;
        const offsetY = (diagonal - canvasHeight) / 2;

        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((watermarkRotation * Math.PI) / 180);
        ctx.translate(-canvasWidth / 2, -canvasHeight / 2);

        for (let y = -offsetY; y < canvasHeight + offsetY; y += spacingY) {
          for (let x = -offsetX; x < canvasWidth + offsetX; x += spacingX) {
            ctx.fillText(watermarkText, x, y);
          }
        }
      } else {
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((watermarkRotation * Math.PI) / 180);
        ctx.fillText(watermarkText, 0, 0);
      }

      ctx.restore();
    },
    [watermarkText, watermarkOpacity, watermarkRotation, watermarkPattern],
  );

  const drawImageWatermark = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      watermarkImg: HTMLImageElement,
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      ctx.save();
      ctx.globalAlpha = watermarkOpacity;

      // Calculate watermark dimensions maintaining aspect ratio
      const aspectRatio =
        watermarkImg.naturalWidth / watermarkImg.naturalHeight;
      const wmWidth = watermarkSize;
      const wmHeight = watermarkSize / aspectRatio;

      if (watermarkPattern === "tiled") {
        const spacingX = wmWidth + watermarkSpacing;
        const spacingY = wmHeight + watermarkSpacing;

        // Calculate rotation offset to cover corners
        const diagonal = Math.sqrt(
          canvasWidth * canvasWidth + canvasHeight * canvasHeight,
        );
        const offsetX = (diagonal - canvasWidth) / 2;
        const offsetY = (diagonal - canvasHeight) / 2;

        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((watermarkRotation * Math.PI) / 180);
        ctx.translate(-canvasWidth / 2, -canvasHeight / 2);

        for (let y = -offsetY; y < canvasHeight + offsetY; y += spacingY) {
          for (let x = -offsetX; x < canvasWidth + offsetX; x += spacingX) {
            ctx.drawImage(
              watermarkImg,
              x - wmWidth / 2,
              y - wmHeight / 2,
              wmWidth,
              wmHeight,
            );
          }
        }
      } else {
        // Single watermark in center
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((watermarkRotation * Math.PI) / 180);
        ctx.drawImage(
          watermarkImg,
          -wmWidth / 2,
          -wmHeight / 2,
          wmWidth,
          wmHeight,
        );
      }

      ctx.restore();
    },
    [
      watermarkOpacity,
      watermarkRotation,
      watermarkSize,
      watermarkPattern,
      watermarkSpacing,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsLoading(true);
    setError(false);

    // Load main image
    const mainImg = new Image();
    mainImg.crossOrigin = "anonymous";

    // Load watermark image if provided
    const watermarkImg = watermarkSrc ? new Image() : null;
    if (watermarkImg) {
      watermarkImg.crossOrigin = "anonymous";
    }

    let mainLoaded = false;
    let watermarkLoaded = !watermarkSrc; // If no watermark src, consider it "loaded"

    const tryRender = () => {
      if (!mainLoaded || !watermarkLoaded) return;

      const imgWidth = mainImg.naturalWidth;
      const imgHeight = mainImg.naturalHeight;

      canvas.width = imgWidth;
      canvas.height = imgHeight;
      setCanvasDimensions({ width: imgWidth, height: imgHeight });

      // Draw original image
      ctx.drawImage(mainImg, 0, 0, imgWidth, imgHeight);

      // Draw watermark
      if (watermarkImg && watermarkSrc) {
        drawImageWatermark(ctx, watermarkImg, imgWidth, imgHeight);
      } else {
        drawTextWatermark(ctx, imgWidth, imgHeight);
      }

      setIsLoading(false);
    };

    mainImg.onload = () => {
      mainLoaded = true;
      tryRender();
    };

    mainImg.onerror = () => {
      setIsLoading(false);
      setError(true);
    };

    if (watermarkImg && watermarkSrc) {
      watermarkImg.onload = () => {
        watermarkLoaded = true;
        tryRender();
      };

      watermarkImg.onerror = () => {
        // Fallback to text watermark if logo fails to load
        watermarkLoaded = true;
        tryRender();
      };

      watermarkImg.src = watermarkSrc;
    }

    mainImg.src = src;
  }, [src, watermarkSrc, drawImageWatermark, drawTextWatermark]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}
      >
        Failed to load image
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`block h-auto w-full object-contain ${isLoading ? "invisible" : "visible"}`}
        style={{
          maxWidth: "100%",
          aspectRatio:
            canvasDimensions.width && canvasDimensions.height
              ? `${canvasDimensions.width} / ${canvasDimensions.height}`
              : "auto",
        }}
        aria-label={alt}
      />
    </div>
  );
}
