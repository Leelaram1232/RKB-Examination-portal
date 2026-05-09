import 'katex/dist/katex.min.css';
import katex from 'katex';
import { useEffect, useRef } from 'react';

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

// Patterns to detect LaTeX content
const INLINE_MATH_PATTERN = /\$([^$]+)\$|\\\([\s\S]+?\\\)/;
const BLOCK_MATH_PATTERN = /\$\$([^$]+)\$\$|\\\[[\s\S]+?\\\]/;
const LATEX_COMMANDS = /\\[a-zA-Z]+/;
const MATH_OPERATORS = /[\^_]\{[^}]*\}|[\^_][a-zA-Z0-9]/;

// Check if text contains LaTeX
export function containsLatex(text: string): boolean {
  if (!text) return false;
  return (
    INLINE_MATH_PATTERN.test(text) ||
    BLOCK_MATH_PATTERN.test(text) ||
    LATEX_COMMANDS.test(text) ||
    MATH_OPERATORS.test(text)
  );
}

// Normalize control characters that may have been produced by JSON parsing
function normalizeLatexString(text: string): string {
  return text
    .replace(/\u0008/g, '\\b')
    .replace(/\u000c/g, '\\f')
    .replace(/\u000d/g, '\\r')
    .replace(/\u0009/g, '\\t')
    .replace(/\u000b/g, '\\v');
}

// Strip delimiters from a math string
function stripDelimiters(math: string): string {
  let s = math.trim();
  if (s.startsWith('$$') && s.endsWith('$$')) return s.slice(2, -2);
  if (s.startsWith('\\[') && s.endsWith('\\]')) return s.slice(2, -2);
  if (s.startsWith('$') && s.endsWith('$')) return s.slice(1, -1);
  if (s.startsWith('\\(') && s.endsWith('\\)')) return s.slice(2, -2);
  return s;
}

// Fix common typos found in database content
function fixCommonTypos(math: string): string {
  return math
    .replace(/\\rightarrrow/g, '\\rightarrow')
    .replace(/\\leftarrrow/g, '\\leftarrow')
    .replace(/\\rightarow/g, '\\rightarrow')
    .replace(/\\leftarow/g, '\\leftarrow')
    .replace(/\\bold/g, '\\mathbf');
}

// Safe KaTeX renderer component
function SafeMath({ math, displayMode = false }: { math: string; displayMode?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        const cleaned = fixCommonTypos(stripDelimiters(math));
        katex.render(cleaned, containerRef.current, {
          displayMode,
          throwOnError: false,
          errorColor: 'inherit',
          strict: false,
          trust: true,
        });
      } catch {
        // On any failure, show the original text
        if (containerRef.current) {
          containerRef.current.textContent = math;
        }
      }
    }
  }, [math, displayMode]);

  return <span ref={containerRef} />;
}

// The delimiter-based split regex
// Matches: $$...$$, \[...\], $...$, \(...\)
const DELIMITER_REGEX = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[\s\S]+?\$|\\\([\s\S]+?\\\))/g;

// Parse and render text with LaTeX
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  if (!content) return null;

  const normalizedContent = normalizeLatexString(content);

  // First, try to split by standard math delimiters
  const parts = normalizedContent.split(DELIMITER_REGEX);

  if (parts.length > 1) {
    // Delimiters were found — render each part accordingly
    return (
      <span className={className}>
        {parts.map((part, index) => {
          if (!part) return null;

          // Display math: $$...$$ or \[...\]
          if (part.startsWith('$$') || part.startsWith('\\[')) {
            return <SafeMath key={index} math={part} displayMode={true} />;
          }

          // Inline math: $...$ or \(...\)
          if (part.startsWith('$') || part.startsWith('\\(')) {
            return <SafeMath key={index} math={part} displayMode={false} />;
          }

          // Plain text segment — still check for naked LaTeX within it
          if (containsLatex(part)) {
            return <NakedMathText key={index} text={part} />;
          }

          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  }

  // No delimiters found — check if the entire text has naked LaTeX
  if (containsLatex(normalizedContent)) {
    return (
      <span className={className}>
        <NakedMathText text={normalizedContent} />
      </span>
    );
  }

  // Plain text, no math at all
  return <span className={className}>{normalizedContent}</span>;
}

/**
 * Renders text that contains naked LaTeX (no delimiters).
 * Strategy: try to render the entire string as KaTeX first.
 * If it fails or produces garbage, fall back to segment-by-segment rendering.
 */
function NakedMathText({ text }: { text: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const fallbackRef = useRef<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const cleaned = fixCommonTypos(text);

    // First attempt: render the whole string as inline math
    try {
      katex.render(cleaned, containerRef.current, {
        displayMode: false,
        throwOnError: true, // We WANT it to throw so we can fall back
        strict: false,
        trust: true,
      });
      fallbackRef.current = false;
    } catch {
      // KaTeX couldn't parse the whole thing — fall back to segment rendering
      fallbackRef.current = true;
      renderSegments(containerRef.current, text);
    }
  }, [text]);

  return <span ref={containerRef} />;
}

/**
 * Segment-by-segment fallback: find LaTeX fragments within plain text
 * and render them individually, keeping non-LaTeX as text nodes.
 */
function renderSegments(container: HTMLElement, text: string) {
  container.innerHTML = '';

  // Regex to find individual LaTeX-like segments:
  // 1. LaTeX commands with any number of braced/bracketed arguments
  // 2. Superscripts/subscripts with braces
  // 3. Simple superscripts/subscripts
  // 4. word^word or word_word patterns
  const segmentRegex = /(\\[a-zA-Z]+(?:\{[^}]*\}|\[[^\]]*\])*(?:[\^_](?:\{[^}]*\}|[a-zA-Z0-9]))?|[\^_]\{[^}]*\}|(?:[a-zA-Z0-9]+[\^_]\{[^}]*\})|(?:[a-zA-Z0-9]+[\^_][a-zA-Z0-9]+))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = segmentRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    // Render the matched math segment
    const span = document.createElement('span');
    try {
      katex.render(fixCommonTypos(match[0]), span, {
        displayMode: false,
        throwOnError: false,
        errorColor: 'inherit',
        strict: false,
        trust: true,
      });
    } catch {
      span.textContent = match[0];
    }
    container.appendChild(span);

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

export default MathRenderer;
