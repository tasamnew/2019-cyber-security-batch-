import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The site logo.
 *
 * The mark lives at `public/logo.svg`. To change the branding, replace that one
 * file — no component edits are needed anywhere. A square transparent SVG or a
 * square PNG with transparency both work.
 *
 * Recommended source canvas: 512x512 with transparency so it stays sharp on
 * high-DPI screens and in the browser tab. Note `public/logo.png` is opaque and
 * near-black, so it renders as a black box and is deliberately unused.
 */
const LOGO_SRC = '/logo.svg';

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      aria-hidden
      width={512}
      height={512}
      unoptimized
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

/** Logo mark plus the site name, sized for nav bars and auth screens. */
export function LogoLockup({
  siteName,
  className,
  markClassName,
  nameClassName,
}: {
  siteName: string;
  className?: string;
  markClassName?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark className={cn('h-8 w-8', markClassName)} />
      <span className={cn('text-text-primary', nameClassName)}>{siteName}</span>
    </span>
  );
}