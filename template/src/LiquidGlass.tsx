import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// Adapted for in-flow cards from childrentime/liquid-glass (MIT).
// Canvas encodes the rounded lens into RG; SVG refracts the backdrop using that map.
export default function LiquidGlass({ children, image }: { children: ReactNode; image?: string }) {
  const id = 'glass-' + useId().replaceAll(':', '');
  const ref = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ map: string; width: number; height: number }>();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const draw = () => {
      const width = Math.round(element.clientWidth), height = Math.round(element.clientHeight);
      if (!width || !height) return;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(width, 320); canvas.height = Math.min(height, 160);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const px = (x / canvas.width - .5) * width;
        const py = (y / canvas.height - .5) * height;
        const qx = Math.abs(px) - width / 2 + 22;
        const qy = Math.abs(py) - height / 2 + 22;
        const distance = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - 22;
        const t = Math.max(0, Math.min(1, 1 + distance / 28));
        const bend = t * t * (3 - 2 * t);
        const i = (y * canvas.width + x) * 4;
        pixels.data[i] = 128 + (px / (width / 2)) * bend * 110;
        pixels.data[i + 1] = 128 + (py / (height / 2)) * bend * 110;
        pixels.data[i + 2] = 128; pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      setLens({ map: canvas.toDataURL(), width, height });
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div className="liquid-glass" ref={ref}>
    {lens && <svg className="glass-defs" aria-hidden="true"><defs>
      <filter id={id} x="-30" y="-30" width={lens.width+60} height={lens.height+60} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage href={lens.map} width={lens.width} height={lens.height} preserveAspectRatio="none" result="lens" />
        <feDisplacementMap in="SourceGraphic" in2="lens" scale="30" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs></svg>}
    <div aria-hidden="true" className="glass-surface" style={{ backgroundImage: image ? `linear-gradient(110deg,#ffffff88,#ffffff55), url(${JSON.stringify(image)})` : undefined, filter: lens ? `url(#${id}) blur(3px)` : 'blur(3px)' }} />
    <div className="glass-content">{children}</div>
  </div>;
}
