import re
from typing import List, Optional
from pydantic import BaseModel

class ExtractedQuestion(BaseModel):
    question_number: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    confidence_score: float = 0.0

def parse_questions(all_text: str) -> List[ExtractedQuestion]:
    """
    Improved parser that detects questions and their options (A, B, C, D).
    """
    # Patterns for question start: "1.", "Q1.", "(1)", "1)"
    q_pattern = re.compile(r"^\s*(?:Q[\.\s]*)?\(?(\d{1,3})[\.\)]\s+(.*)$", re.IGNORECASE)
    
    # Patterns for options: "(A)", "A.", "a)", "(a)"
    opt_pattern = re.compile(r"^\s*\(?([A-D])\)?[Rank\.\)]\s+(.*)$", re.IGNORECASE)

    raw_lines = all_text.splitlines()
    questions: List[ExtractedQuestion] = []
    
    current_q: Optional[dict] = None

    def flush_current():
        if current_q:
            # Clean up text
            text = " ".join(current_q['text_lines']).strip()
            # If we didn't find clear options, try to split the text if options are inline
            if not any([current_q['a'], current_q['b'], current_q['c'], current_q['d']]):
                parts = re.split(r"\s+\(?([A-D])\)?[Rank\.\)]\s+", text)
                if len(parts) > 1:
                    current_q['text_lines'] = [parts[0]]
                    text = parts[0].strip()
                    for i in range(1, len(parts), 2):
                        opt_let = parts[i].upper()
                        opt_val = parts[i+1].strip() if i+1 < len(parts) else ""
                        if opt_let == 'A': current_q['a'] = opt_val
                        elif opt_let == 'B': current_q['b'] = opt_val
                        elif opt_let == 'C': current_q['c'] = opt_val
                        elif opt_let == 'D': current_q['d'] = opt_val

            questions.append(
                ExtractedQuestion(
                    question_number=current_q['number'],
                    question_text=text,
                    option_a=current_q['a'],
                    option_b=current_q['b'],
                    option_c=current_q['c'],
                    option_d=current_q['d'],
                    confidence_score=0.8
                )
            )

    for line in raw_lines:
        line = line.strip()
        if not line:
            continue

        # Check for new question
        mq = q_pattern.match(line)
        if mq:
            flush_current()
            current_q = {
                'number': int(mq.group(1)),
                'text_lines': [mq.group(2)],
                'a': "", 'b': "", 'c': "", 'd': "",
                'current_opt': None
            }
            continue

        if current_q:
            # Check for option
            mo = opt_pattern.match(line)
            if mo:
                opt_let = mo.group(1).upper()
                current_q['current_opt'] = opt_let
                current_q[opt_let.lower()] = mo.group(2)
            elif current_q['current_opt']:
                # Append to current option
                current_q[current_q['current_opt'].lower()] += " " + line
            else:
                # Append to question text
                current_q['text_lines'].append(line)

    flush_current()
    return questions

# Sample text for testing
sample_text = """
1. What is the capital of France?
(A) Paris
(B) London
(C) Berlin
(D) Madrid

Q2. Solve for x: 2x + 5 = 15
a) 5
b) 10
c) 15
d) 20

3. This is a question with inline options. (A) Option 1 (B) Option 2 (C) Option 3 (D) Option 4
"""

results = parse_questions(sample_text)
for q in results:
    print(f"Q{q.question_number}: {q.question_text}")
    print(f"  A: {q.option_a}")
    print(f"  B: {q.option_b}")
    print(f"  C: {q.option_c}")
    print(f"  D: {q.option_d}")
    print("-" * 20)
