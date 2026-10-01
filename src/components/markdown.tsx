'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';

/**
 * Markdown renderer with syntax-highlighted code blocks.
 *
 * XSS: `react-markdown` renders to React elements and never evaluates raw HTML —
 * `rehype-raw` is deliberately NOT in the plugin chain, so embedded <script> or
 * onerror attributes in a post body are rendered as inert text. Links are forced
 * to `rel="noopener noreferrer"` so a malicious link cannot reach `window.opener`.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const components: Components = {
    a({ href, children, ...props }) {
      const external = href?.startsWith('http');
      return (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
          {...props}
        >
          {children}
        </a>
      );
    },
    // Fenced blocks
    code({ className: codeClass, children, ...props }) {
      const language = /language-(\w+)/.exec(codeClass ?? '')?.[1];
      const text = String(children).replace(/\n$/, '');

      // Inline code has no language class and no newlines.
      if (!language && !text.includes('\n')) {
        return (
          <code
            className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[0.85em] text-accent-cyan"
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <code className={cn('hljs block', codeClass)} data-language={language ?? 'text'} {...props}>
          {children}
        </code>
      );
    },
    pre({ children, ...props }) {
      return (
        <div className="group relative my-4 overflow-x-auto rounded-lg border border-border bg-[#0b1220]">
          {(() => {
            // Surface the language in a header bar above the code.
            const child = Array.isArray(children) ? children[0] : children;
            const lang =
              child && typeof child === 'object' && 'props' in child
                ? ((child.props as { className?: string })?.className ?? '')
                    .replace('hljs language-', '')
                    .replace('hljs', '')
                : '';
            return lang ? (
              <div className="border-b border-border px-4 py-1.5 text-[0.7rem] uppercase tracking-wider text-accent-cyan/80">
                {lang}
              </div>
            ) : null;
          })()}
          <pre className="scrollbar-thin overflow-x-auto p-4 text-sm leading-relaxed" {...props}>
            {children}
          </pre>
        </div>
      );
    },
    // Tables get horizontal scroll on mobile instead of overflowing the page.
    table({ children, ...props }) {
      return (
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm" {...props}>
            {children}
          </table>
        </div>
      );
    },
    img({ src, alt, ...props }) {
      // Remote images are allowed but lazy-loaded and referrer-suppressed.
      return <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" {...props} />;
    },
    blockquote({ children, ...props }) {
      return (
        <blockquote
          className="my-4 border-l-2 border-accent-cyan/60 bg-white/[0.03] py-1 pl-4 text-text-secondary"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
    h1({ children, ...props }) {
      return <h1 className="mb-3 mt-6 text-2xl font-bold text-text-primary" {...props}>{children}</h1>;
    },
    h2({ children, ...props }) {
      return <h2 className="mb-2 mt-6 text-xl font-semibold text-text-primary" {...props}>{children}</h2>;
    },
    h3({ children, ...props }) {
      return <h3 className="mb-2 mt-5 text-lg font-semibold text-text-primary" {...props}>{children}</h3>;
    },
    ul({ children, ...props }) {
      return <ul className="my-3 list-disc space-y-1 pl-6" {...props}>{children}</ul>;
    },
    ol({ children, ...props }) {
      return <ol className="my-3 list-decimal space-y-1 pl-6" {...props}>{children}</ol>;
    },
    p({ children, ...props }) {
      return <p className="my-2 leading-relaxed text-text-secondary" {...props}>{children}</p>;
    },
  };

  return (
    <div className={cn('markdown-body text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}