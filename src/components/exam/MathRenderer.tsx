import 'katex/dist/katex.min.css';
import katex from 'katex';
import { useEffect, useRef } from 'react';

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

// Patterns to detect LaTeX content
const INLINE_MATH_PATTERN = /\$([^$]+)\$/;
const BLOCK_MATH_PATTERN = /\$\$([^$]+)\$\$/;
const LATEX_COMMANDS = /\\[a-zA-Z]+|\^|_/;

// Check if text contains LaTeX
export function containsLatex(text: string): boolean {
  if (!text) return false;
  return INLINE_MATH_PATTERN.test(text) || BLOCK_MATH_PATTERN.test(text) || LATEX_COMMANDS.test(text);
}

// Safe KaTeX renderer component
function SafeMath({ math, displayMode = false }: { math: string; displayMode?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        // Fix common typos in data
        const fixedMath = math
          .replace(/\\rightarrrow/g, '\\rightarrow')
          .replace(/\\leftarrrow/g, '\\leftarrow')
          .replace(/\\rightarow/g, '\\rightarrow')
          .replace(/\\leftarow/g, '\\leftarrow')
          .replace(/\\bold/g, '\\mathbf');

        katex.render(fixedMath, containerRef.current, {
          displayMode,
          throwOnError: false,
          errorColor: 'inherit', // Prevent red text for errors
          strict: false,
          trust: true
        });
      } catch (e) {
        containerRef.current.textContent = math;
      }
    }
  }, [math, displayMode]);

  return <span ref={containerRef} />;
}

// Parse and render text with LaTeX
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  if (!content) return null;

  // If LaTeX came through JSON, some commands like `\frac` (`\f`) or `\rho` (`\r`)
  // can be converted into control characters. Map them back so KaTeX can parse.
  const normalizedContent = content
    .replace(/\u0008/g, '\\b')
    .replace(/\u000c/g, '\\f')
    .replace(/\u000d/g, '\\r')
    .replace(/\u0009/g, '\\t')
    .replace(/\u000b/g, '\\v');

  // Regex to match various LaTeX delimiters:
  // 1. $$ ... $$ (display math)
  // 2. \[ ... \] (display math)
  // 3. $ ... $ (inline math)
  // 4. \( ... \) (inline math)
  const regex = /(\$\$(?:[^\$]|\$[^$])+\$\$|\\\[[\s\S]*?\\\]|\$(?:[^\$]|\$[^$])+\$|\\\x28[\s\S]*?\\\x29)/g;
  
  const parts = normalizedContent.split(regex);
  
  if (parts.length <= 1) {
    // If no delimiters found, try the legacy InlineTextWithMath for naked commands/powers
    return <InlineTextWithMath text={normalizedContent} className={className} />;
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;

        // Display math: $$...$$ or \[...\]
        if ((part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('\\[') && part.endsWith('\\]'))) {
          let math = part.startsWith('$$') ? part.slice(2, -2) : part.slice(2, -2);
          return <SafeMath key={index} math={math} displayMode={true} />;
        }

        // Inline math: $...$ or \(...\)
        if ((part.startsWith('$') && part.endsWith('$')) || (part.startsWith('\\(') && part.endsWith('\\)'))) {
          let math = part.startsWith('$') ? part.slice(1, -1) : part.slice(2, -2);
          return <SafeMath key={index} math={math} displayMode={false} />;
        }

        // Plain text (still check for naked commands)
        return <InlineTextWithMath key={index} text={part} />;
      })}
    </span>
  );
}

// Render inline math within text
function InlineTextWithMath({ text, className = '' }: { text: string; className?: string }) {
  if (!text) return null;

  // Split by:
  // 1. word^word or word_word (naked powers/subscripts)
  // 2. LaTeX commands starting with \ (e.g. \alpha, \sqrt{...})
  // 3. Environments like \begin{...}...\end{...}
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  
  // This regex finds math-like segments that aren't wrapped in delimiters:
  // 1. LaTeX commands with optional braced arguments: \sqrt{x}, \alpha
  // 2. Superscripts/Subscripts with braces: ^{123}, _{abc}
  // 3. Simple Superscripts/Subscripts: ^2, _i
  // 4. Naked word-power-word: x^2, a_i
  const regex = /((?:\\[a-zA-Z]+(?:\{[^}]*\})?)|(?:[\^_]\{[^}]*\})|(?:[\^_][a-zA-Z0-9])|(?:\b[a-zA-Z0-9]+[\^_][a-zA-Z0-9]+\b))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    const math = match[0];
    parts.push(<SafeMath key={match.index} math={math} displayMode={false} />);
    
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no parts were found via the regex split, just render the text
  if (parts.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return <span className={className}>{parts}</span>;
}

export default MathRenderer;
