/**
 * Luminous mesh-gradient backdrop.
 *
 * A fixed, pointer-events-none layer of soft, heavily-blurred color blobs that
 * drift slowly. Sits behind all content (-z-10) so the glass surfaces above
 * pick up a gentle, shifting color wash. Animations use transform only (GPU),
 * and the whole layer is fixed (no scroll repaint cost).
 */
export function MeshBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[12%] -top-[15%] h-[60vh] w-[60vh] animate-blob-a rounded-full bg-primary-200/40 blur-[110px]" />
      <div className="absolute -right-[8%] top-[6%] h-[52vh] w-[52vh] animate-blob-b rounded-full bg-gold-200/35 blur-[120px]" />
      <div className="absolute -bottom-[14%] left-[18%] h-[58vh] w-[58vh] animate-blob-c rounded-full bg-primary-300/30 blur-[120px]" />
      <div className="absolute bottom-[8%] right-[12%] h-[42vh] w-[42vh] animate-blob-b rounded-full bg-gold-100/45 blur-[130px]" />
      {/* Fine grain to break up the gradient banding (fixed, never repainted on scroll). */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
