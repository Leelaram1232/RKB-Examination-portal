import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

// Patterns to detect LaTeX content
const INLINE_MATH_PATTERN = /\$([^$]+)\$/g;
const BLOCK_MATH_PATTERN = /\$\$([^$]+)\$\$/g;
const LATEX_COMMANDS = /\\[a-zA-Z]+/;

// Check if text contains LaTeX
export function containsLatex(text: string): boolean {
  return INLINE_MATH_PATTERN.test(text) || BLOCK_MATH_PATTERN.test(text) || LATEX_COMMANDS.test(text);
}

// Parse and render text with LaTeX
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  // Check for block math first
  if (content.includes('$$')) {
    const parts = content.split(/(\$\$[^$]+\$\$)/g);
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

  return <InlineTextWithMath text={content} className={className} />;
}

// Render inline math within text
function InlineTextWithMath({ text, className = '' }: { text: string; className?: string }) {
  // Split by inline math patterns
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  const regex = /\$([^$]+)\$/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Add the math
    const math = match[1];
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

  // If no math found, check for LaTeX commands without delimiters
  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === 'string')) {
    // Try to render as LaTeX if it contains commands
    if (LATEX_COMMANDS.test(text)) {
      try {
        return <InlineMath math={text} />;
      } catch (e) {
        return <span className={className}>{text}</span>;
      }
    }
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
