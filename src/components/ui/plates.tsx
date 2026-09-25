import { artPlate } from "@/domain/content/sprites";

/**
 * A baked plate. The atlas paints sheets in the browser; these few pieces are
 * engraved by hand and shipped as files instead. Whole number scales only, so
 * a plate never goes soft.
 */
export function Plate({
  name,
  scale = 1,
  className,
}: {
  name: string;
  scale?: number;
  className?: string;
}) {
  const plate = artPlate(name);
  if (!plate) return null;
  const width = plate.w * scale;
  const height = plate.h * scale;
  return (
    <img
      src={plate.file}
      alt={plate.alt}
      width={width}
      height={height}
      className={className}
      style={{ width, height, imageRendering: "pixelated" }}
    />
  );
}
