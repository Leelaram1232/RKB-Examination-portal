import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

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

// Parse and render text with LaTeX
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  // If LaTeX came through JSON, some commands like `\frac` (`\f`) or `\rho` (`\r`)
  // can be converted into control characters. Map them back so KaTeX can parse.
  const normalizedContent = (content || '')
    .replace(/\u0008/g, '\\b')
    .replace(/\u000c/g, '\\f')
    .replace(/\u000d/g, '\\r')
    .replace(/\u0009/g, '\\t')
    .replace(/\u000b/g, '\\v');

  // Check for block math first
  if (normalizedContent.includes('$$')) {
    const parts = normalizedContent.split(/(\$\$[^$]+\$\$)/g);
    return (
      <span className={className}>
        {parts.map((part, index) => {
          if (part.startsWith('$$') && part.endsWith('$$')) {
            const math = part.slice(2, -2);
            try {
              return <BlockMath key={index} math={math} />;
            } catch (e) {
              return <span key={index}>{part}</span>;
            }
          }
          return <InlineTextWithMath key={index} text={part} />;
        })}
      </span>
    );
  }

  return <InlineTextWithMath text={normalizedContent} className={className} />;
}

// Render inline math within text
function InlineTextWithMath({ text, className = '' }: { text: string; className?: string }) {
  if (!text) return null;

  // Split by:
  // 1. $...$ (standard inline math)
  // 2. word^word or word_word (naked powers/subscripts)
  // 3. LaTeX commands starting with \
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  
  // This regex finds math-like segments
  const regex = /(\$[^$]+\$|(?:\b[a-zA-Z0-9]+[\^_][a-zA-Z0-9]+\b)|(?:\\[a-zA-Z]+(?:\{[^}]*\})?))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    let math = match[0];
    const isWrapped = math.startsWith('$') && math.endsWith('$');
    
    if (isWrapped) {
      math = math.slice(1, -1);
    }
    
    try {
      parts.push(<InlineMath key={match.index} math={math} />);
    } catch (e) {
      parts.push(match[0]);
    }
    
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

// Format chemistry formulas
export function formatChemistry(text: string): string {
  // Convert common chemistry patterns to LaTeX
  let result = text;
  
  // Subscripts for numbers after elements (H2O -> H_2O)
  result = result.replace(/([A-Z][a-z]?)(\d+)/g, '$1_{$2}');
  
  // Superscripts for charges (Fe3+ -> Fe^{3+})
  result = result.replace(/([A-Z][a-z]?)(\d*[+-])/g, '$1^{$2}');
  
  // Arrow reactions
  result = result.replace(/->|→/g, '\\rightarrow');
  result = result.replace(/<->|↔/g, '\\leftrightarrow');
  
  return result;
}

// Format physics equations
export function formatPhysics(text: string): string {
  let result = text;
  
  // Common physics symbols
  result = result.replace(/(\b)alpha(\b)/gi, '\\alpha');
  result = result.replace(/(\b)beta(\b)/gi, '\\beta');
  result = result.replace(/(\b)gamma(\b)/gi, '\\gamma');
  result = result.replace(/(\b)delta(\b)/gi, '\\delta');
  result = result.replace(/(\b)theta(\b)/gi, '\\theta');
  result = result.replace(/(\b)omega(\b)/gi, '\\omega');
  result = result.replace(/(\b)mu(\b)/gi, '\\mu');
  result = result.replace(/(\b)lambda(\b)/gi, '\\lambda');
  result = result.replace(/(\b)pi(\b)/gi, '\\pi');
  
  return result;
}

export default MathRenderer;
