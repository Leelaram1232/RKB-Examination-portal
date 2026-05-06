// Enhanced Question Parser with Math/Chemistry/Physics support

export interface ParsedQuestion {
  id: string;
  questionNumber: number;
  questionText: string;
  // For MCQ questions
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  // For fill-in-the-blank / numerical questions
  questionType?: 'MCQ' | 'FILL_BLANK';
  correctAnswer?: string | null;
  marks: number;
  negativeMarks: number;
  isValid: boolean;
  errors: string[];
  hasLatex: boolean;
  imageUrl?: string | null;
  optionAImage?: string | null;
  optionBImage?: string | null;
  optionCImage?: string | null;
  optionDImage?: string | null;
  subject?: string;
  sectionName?: string;
}

export interface ParsedSection {
  id: string;
  name: string;
  questions: ParsedQuestion[];
}

export interface ParseResult {
  success: boolean;
  sections: ParsedSection[];
  totalQuestions: number;
  validQuestions: number;
  invalidQuestions: number;
  errors: string[];
}

// Generate unique IDs for preview purposes
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

// Normalize answer to single uppercase letter
const normalizeAnswer = (answer: string): string => {
  const cleaned = answer.trim().toUpperCase();
  if (['A', 'B', 'C', 'D', '1', '2', '3', '4'].includes(cleaned)) {
    if (cleaned === '1') return 'A';
    if (cleaned === '2') return 'B';
    if (cleaned === '3') return 'C';
    if (cleaned === '4') return 'D';
    return cleaned;
  }
  // Handle parenthetical format like (1), (2), (3), (4)
  const parenMatch = cleaned.match(/\(([1234ABCD])\)/);
  if (parenMatch) {
    const val = parenMatch[1];
    if (val === '1') return 'A';
    if (val === '2') return 'B';
    if (val === '3') return 'C';
    if (val === '4') return 'D';
    return val;
  }
  return '';
};

// Check if text contains LaTeX
const containsLatex = (text: string): boolean => {
  if (!text) return false;
  const patterns = [
    /\$[^$]+\$/,           // Inline math $...$
    /\$\$[^$]+\$\$/,       // Block math $$...$$
    /\^|_/,                // Powers and subscripts (simple)
    /\\frac\{/,            // Fractions
    /\\sqrt\{/,            // Square roots
    /\\int/,               // Integrals
    /\\sum/,               // Summations
    /\\lim/,               // Limits
    /\\alpha|\\beta|\\gamma|\\theta|\\omega|\\mu|\\lambda|\\pi/, // Greek letters
    /\\vec\{/,             // Vectors
    /\\mathbf\{/,          // Bold math
    /\\rightarrow|\\leftarrow|\\leftrightarrow/, // Arrows
    /\\times|\\div|\\pm|\\mp|\\cdot/, // Operators
    /\\leq|\\geq|\\neq/,   // Comparisons
    /\\sin|\\cos|\\tan|\\log|\\ln/, // Functions
  ];
  return patterns.some(pattern => pattern.test(text));
};

// Convert common patterns to LaTeX
const convertToLatex = (text: string): string => {
  let result = text;
  
  // Skip if already has LaTeX markers
  if (containsLatex(result)) {
    return result;
  }
  
  // Chemistry: subscripts for numbers after elements (H2O -> H_{2}O)
  result = result.replace(/([A-Z][a-z]?)(\d+)(?![^{]*})/g, (match, element, num) => {
    return `${element}_{${num}}`;
  });
  
  // Chemistry: superscripts for charges (Fe3+ -> Fe^{3+}, Cl- -> Cl^{-})
  result = result.replace(/([A-Z][a-z]?\d*)(\+|\-)(\d*)/g, (match, element, sign, num) => {
    if (!element) return match;
    const charge = num ? `${num}${sign}` : sign;
    return `${element}^{${charge}}`;
  });
  
  // Arrow reactions
  result = result.replace(/->/g, '\\rightarrow');
  result = result.replace(/<->/g, '\\leftrightarrow');
  result = result.replace(/<=>/g, '\\rightleftharpoons');
  
  // Common Greek letters (word boundary matching)
  const greekLetters: Record<string, string> = {
    'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
    'epsilon': '\\epsilon', 'zeta': '\\zeta', 'eta': '\\eta', 'theta': '\\theta',
    'iota': '\\iota', 'kappa': '\\kappa', 'lambda': '\\lambda', 'mu': '\\mu',
    'nu': '\\nu', 'xi': '\\xi', 'pi': '\\pi', 'rho': '\\rho', 'sigma': '\\sigma',
    'tau': '\\tau', 'upsilon': '\\upsilon', 'phi': '\\phi', 'chi': '\\chi',
    'psi': '\\psi', 'omega': '\\omega',
    'Alpha': '\\Alpha', 'Beta': '\\Beta', 'Gamma': '\\Gamma', 'Delta': '\\Delta',
    'Theta': '\\Theta', 'Lambda': '\\Lambda', 'Pi': '\\Pi', 'Sigma': '\\Sigma',
    'Phi': '\\Phi', 'Psi': '\\Psi', 'Omega': '\\Omega'
  };
  
  for (const [word, latex] of Object.entries(greekLetters)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    result = result.replace(regex, latex);
  }
  
  // Fractions like 1/2, 3/4 (not in context of dates or units)
  result = result.replace(/(\d+)\/(\d+)(?!\s*(?:m|s|kg|N|J|W|Hz|cm|mm|km))/g, '\\frac{$1}{$2}');
  
  // Square roots
  result = result.replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');
  result = result.replace(/√(\d+)/g, '\\sqrt{$1}');
  result = result.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  
  // Powers like x^2, y^3, but not already in braces
  result = result.replace(/([a-zA-Z])(\^)(\d+)(?![}])/g, '$1^{$3}');
  
  // Common physics/math notations
  result = result.replace(/\binfinity\b/gi, '\\infty');
  result = result.replace(/\bdegree\b/gi, '^{\\circ}');
  result = result.replace(/°/g, '^{\\circ}');
  
  // Comparison operators
  result = result.replace(/>=/g, '\\geq');
  result = result.replace(/<=/g, '\\leq');
  result = result.replace(/!=/g, '\\neq');
  result = result.replace(/~=/g, '\\approx');
  
  // If we made LaTeX-style changes, wrap in $ if not already
  if (result !== text && !result.includes('$')) {
    // Only wrap if we added LaTeX commands
    if (/\\[a-zA-Z]+/.test(result) || /_{[^}]+}/.test(result) || /\^{[^}]+}/.test(result)) {
      // Wrap the entire text if it contains significant LaTeX
      const latexCommandCount = (result.match(/\\[a-zA-Z]+/g) || []).length;
      if (latexCommandCount > 0) {
        result = `$${result}$`;
      }
    }
  }
  
  return result;
};

// Parse a single question block
const parseQuestionBlock = (
  block: string,
  questionNumber: number,
  defaultMarks: number,
  defaultNegativeMarks: number
): ParsedQuestion => {
  const errors: string[] = [];
  let questionText = '';
  let optionA = '';
  let optionB = '';
  let optionC = '';
  let optionD = '';
  let correctOption = '';
  let correctAnswer: string | null = null;
  let subject = '';

  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Find the question text (everything before options)
  let optionStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if this line starts an option
    if (/^[\(\[]?[Aa][\)\]\.:\-]?\s/.test(line) || /^1[\)\.\-]\s/.test(line) || /^\(1\)\s/.test(line)) {
      optionStartIndex = i;
      break;
    }
  }

  if (optionStartIndex === -1) {
    // Try to find options inline
    const fullText = lines.join(' ');
    const optionMatch = fullText.match(/(.+?)(?:\s*[\(\[]?[Aa][\)\]\.:\-]?\s*(.+?))?(?:\s*[\(\[]?[Bb][\)\]\.:\-]?\s*(.+?))?(?:\s*[\(\[]?[Cc][\)\]\.:\-]?\s*(.+?))?(?:\s*[\(\[]?[Dd][\)\]\.:\-]?\s*(.+?))?(?:\s*(?:Answer|Ans|Correct)[:\s]*([A-Da-d1-4]))?$/i);
    
    if (optionMatch) {
      questionText = optionMatch[1]?.trim() || '';
      optionA = optionMatch[2]?.trim() || '';
      optionB = optionMatch[3]?.trim() || '';
      optionC = optionMatch[4]?.trim() || '';
      optionD = optionMatch[5]?.trim() || '';
      correctOption = normalizeAnswer(optionMatch[6] || '');
    }
  } else {
    // Question text is everything before options
    questionText = lines.slice(0, optionStartIndex).join(' ').trim();
    
    // Remove question number prefix
    questionText = questionText.replace(/^Q\.?\s*\d+[\.\)\-:\s]*/i, '').trim();
    
    // Parse options
    const optionLines = lines.slice(optionStartIndex);
    let currentOption = '';
    let currentText = '';
    
    for (const line of optionLines) {
      // Check for answer line
      const answerMatch = line.match(/^(?:Answer|Ans|Correct)[:\s]*([A-Da-d1-4\(\)]+|\S.+)$/i);
      if (answerMatch) {
        // Save current option
        if (currentOption && currentText) {
          if (currentOption === 'A') optionA = currentText.trim();
          else if (currentOption === 'B') optionB = currentText.trim();
          else if (currentOption === 'C') optionC = currentText.trim();
          else if (currentOption === 'D') optionD = currentText.trim();
        }
        const rawAns = answerMatch[1];
        const mcqNorm = normalizeAnswer(rawAns);
        if (mcqNorm) {
          correctOption = mcqNorm;
        } else {
          // Treat as fill-in-the-blank style textual/numerical answer
          correctAnswer = rawAns.trim();
        }
        continue;
      }
      
      // Check if line starts a new option - handle various formats
      const optionPrefixMatch = line.match(/^[\(\[]?([AaBbCcDd1234])[\)\]\.:\-]?\s*(.*)/);
      if (optionPrefixMatch) {
        // Save previous option
        if (currentOption && currentText) {
          if (currentOption === 'A') optionA = currentText.trim();
          else if (currentOption === 'B') optionB = currentText.trim();
          else if (currentOption === 'C') optionC = currentText.trim();
          else if (currentOption === 'D') optionD = currentText.trim();
        }
        
        // Start new option
        const optChar = optionPrefixMatch[1].toUpperCase();
        currentOption = optChar === '1' ? 'A' : optChar === '2' ? 'B' : optChar === '3' ? 'C' : optChar === '4' ? 'D' : optChar;
        currentText = optionPrefixMatch[2] || '';
      } else {
        // Continue current option
        currentText += ' ' + line;
      }
    }
    
    // Save last option
    if (currentOption && currentText) {
      if (currentOption === 'A') optionA = currentText.trim();
      else if (currentOption === 'B') optionB = currentText.trim();
      else if (currentOption === 'C') optionC = currentText.trim();
      else if (currentOption === 'D') optionD = currentText.trim();
    }
  }

  // Clean up question text - remove Q number if still present
  questionText = questionText.replace(/^Q\.?\s*\d+[\.\)\-:\s]*/i, '').trim();

  // Detect subject from content
  const textLower = questionText.toLowerCase();
  if (textLower.includes('force') || textLower.includes('velocity') || textLower.includes('acceleration') ||
      textLower.includes('electric') || textLower.includes('magnetic') || textLower.includes('wave') ||
      textLower.includes('frequency') || textLower.includes('wavelength') || textLower.includes('resistance')) {
    subject = 'Physics';
  } else if (textLower.includes('element') || textLower.includes('compound') || textLower.includes('reaction') ||
             textLower.includes('acid') || textLower.includes('organic') || textLower.includes('molar') ||
             textLower.includes('oxidation') || textLower.includes('electron')) {
    subject = 'Chemistry';
  } else if (textLower.includes('function') || textLower.includes('integral') || textLower.includes('matrix') ||
             textLower.includes('probability') || textLower.includes('equation') || textLower.includes('triangle') ||
             textLower.includes('derivative') || textLower.includes('limit')) {
    subject = 'Mathematics';
  }

  // Convert scientific notation to LaTeX
  questionText = convertToLatex(questionText);
  optionA = convertToLatex(optionA);
  optionB = convertToLatex(optionB);
  optionC = convertToLatex(optionC);
  optionD = convertToLatex(optionD);

  // Check if any field has LaTeX
  const hasLatex = containsLatex(questionText) || 
                   containsLatex(optionA) || 
                   containsLatex(optionB) || 
                   containsLatex(optionC) || 
                   containsLatex(optionD);

  // Validate
  if (!questionText) errors.push('Missing question text');

  // Decide question type: default MCQ, but if we have a textual/numerical answer and no MCQ key, treat as fill-in-the-blank
  let questionType: 'MCQ' | 'FILL_BLANK' = 'MCQ';
  if (!correctOption && correctAnswer) {
    questionType = 'FILL_BLANK';
  }

  if (questionType === 'MCQ') {
    if (!optionA) errors.push('Missing option A');
    if (!optionB) errors.push('Missing option B');
    if (!optionC) errors.push('Missing option C');
    if (!optionD) errors.push('Missing option D');
    if (!correctOption) errors.push('Missing correct answer');
    else if (!['A', 'B', 'C', 'D'].includes(correctOption)) {
      errors.push('Invalid correct answer (must be A, B, C, or D)');
    }
  } else {
    // Fill in the blank: need a textual/numerical correct answer
    if (!correctAnswer || !correctAnswer.trim()) {
      errors.push('Missing fill-in-the-blank answer');
    }
  }

  return {
    id: generateId(),
    questionNumber,
    questionText,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    questionType,
    correctAnswer: correctAnswer || null,
    marks: defaultMarks,
    negativeMarks: defaultNegativeMarks,
    isValid: errors.length === 0,
    errors,
    hasLatex,
    subject: subject || undefined,
  };
};

// Main parser function
export const parseQuestionText = (
  text: string,
  defaultMarks: number = 4,
  defaultNegativeMarks: number = 1
): ParseResult => {
  const errors: string[] = [];
  const sections: ParsedSection[] = [];
  
  if (!text || text.trim().length === 0) {
    return {
      success: false,
      sections: [],
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      errors: ['No text provided'],
    };
  }

  // Split by sections
  const sectionPattern = /SECTION[:\s]+([^\n]+)/gi;
  const sectionMatches = [...text.matchAll(sectionPattern)];
  
  let sectionParts: { name: string; content: string }[] = [];
  
  if (sectionMatches.length > 0) {
    // Multiple sections found
    for (let i = 0; i < sectionMatches.length; i++) {
      const match = sectionMatches[i];
      const startIndex = match.index! + match[0].length;
      const endIndex = sectionMatches[i + 1]?.index || text.length;
      
      sectionParts.push({
        name: match[1].trim(),
        content: text.substring(startIndex, endIndex),
      });
    }
  } else {
    // No section headers, treat as single "General" section
    sectionParts.push({
      name: 'General',
      content: text,
    });
  }

  // Parse each section
  for (const section of sectionParts) {
    const questions: ParsedQuestion[] = [];
    
    // Split by question numbers - Q1, Q2, Q.1, Q 1, 1., 1), etc.
    const questionPattern = /(?:^|\n)\s*(?:Q\.?\s*)?(\d+)[\.\)\-:\s]/gi;
    const questionMatches = [...section.content.matchAll(questionPattern)];
    
    if (questionMatches.length === 0) {
      // Try to parse as single question
      const parsed = parseQuestionBlock(section.content, 1, defaultMarks, defaultNegativeMarks);
      if (parsed.questionText || parsed.optionA) {
        questions.push(parsed);
      }
    } else {
      for (let i = 0; i < questionMatches.length; i++) {
        const match = questionMatches[i];
        const questionNum = parseInt(match[1], 10);
        const startIndex = match.index!;
        const endIndex = questionMatches[i + 1]?.index || section.content.length;
        
        const questionBlock = section.content.substring(startIndex, endIndex);
        const parsed = parseQuestionBlock(questionBlock, questionNum, defaultMarks, defaultNegativeMarks);
        questions.push(parsed);
      }
    }
    
    if (questions.length > 0) {
      sections.push({
        id: generateId(),
        name: section.name,
        questions,
      });
    }
  }

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
  const validQuestions = sections.reduce(
    (sum, s) => sum + s.questions.filter(q => q.isValid).length,
    0
  );
  const invalidQuestions = totalQuestions - validQuestions;

  if (totalQuestions === 0) {
    errors.push('No questions could be parsed from the text');
  }

  return {
    success: errors.length === 0 && totalQuestions > 0,
    sections,
    totalQuestions,
    validQuestions,
    invalidQuestions,
    errors,
  };
};

// Export for future file upload integration
export const parseFromFile = async (file: File): Promise<ParseResult> => {
  const text = await file.text();
  return parseQuestionText(text);
};

// Export for future OCR integration
export const parseFromImage = async (_imageUrl: string): Promise<ParseResult> => {
  return {
    success: false,
    sections: [],
    totalQuestions: 0,
    validQuestions: 0,
    invalidQuestions: 0,
    errors: ['OCR parsing not yet implemented'],
  };
};
