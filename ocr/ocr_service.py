"""
Minimal example OCR HTTP service using Tesseract (Windows‑friendly).

Supabase `extract-questions` will call this when LOCAL_OCR_SERVICE_URL is set.
The request/response JSON shape matches what the edge function expects.
"""

import io
import os
import re
from typing import List, Optional
from urllib.parse import unquote, urlparse

import fitz  # PyMuPDF
import json
import pytesseract
import requests
import time
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from PIL import Image
from pydantic import BaseModel

# Configure Tesseract path for Windows
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


class ExtractRequest(BaseModel):
    upload_id: str
    file_url: str


class ExtractedQuestion(BaseModel):
    question_number: int
    question_text: str
    question_type: str = "MCQ" # MCQ, NUMERICAL, MATCH_COLUMN
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_option: Optional[str] = None
    correct_answer: Optional[str] = None # For numerical/matching
    solution_text: Optional[str] = None
    section_name: str = "Section"
    suggested_marks: int = 4
    confidence_score: float = 0.0
    has_image: bool = False
    image_description: Optional[str] = None
    subject: Optional[str] = None


class ExtractedImage(BaseModel):
    question_number: int
    image_type: str
    option_key: Optional[str] = None
    description: str
    position: Optional[str] = None


class ExtractResponse(BaseModel):
    questions: List[ExtractedQuestion]
    images: List[ExtractedImage]


app = FastAPI()

# Enable CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def pdf_to_text(pdf_bytes: bytes) -> tuple[str, List[ExtractedImage]]:
    """Convert all pages of a PDF to text and detect images."""
    try:
        # Open PDF with PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        texts: List[str] = []
        extracted_images: List[ExtractedImage] = []
        print(f"PDF opened successfully. Total pages: {len(doc)}")
        
        for i, page in enumerate(doc):
            # 1. OCR text
            pix = page.get_pixmap(dpi=300)
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data)).convert("RGB")
            
            # Using PSM 6 (Assume a single uniform block of text) or 3 (Fully automatic)
            custom_config = r'--oem 3 --psm 6'
            text = pytesseract.image_to_string(img, lang="eng", config=custom_config)
            print(f"Page {i+1}: Extracted {len(text)} characters.")
            texts.append(text)

            # 2. Find actual images in PDF
            page_images = page.get_images(full=True)
            if page_images:
                print(f"Page {i+1}: Found {len(page_images)} raw images.")
                for img_info in page_images:
                    # We don't save the actual file since we don't have a public URL to serve it
                    # but we mark its existence for the UI to know it needs an image placeholder
                    extracted_images.append(ExtractedImage(
                        question_number=0, # Will be mapped later or left as 0
                        image_type="diagram",
                        description=f"Image found on PDF page {i+1}",
                        position=f"Page {i+1}"
                    ))
            
        doc.close()
        return "\n\n".join(texts), extracted_images
    except Exception as e:
        print(f"Error converting PDF: {e}")
        return "", []
        
    texts: List[str] = []
    for img in pages:
        if not isinstance(img, Image.Image):
            img = Image.fromarray(img)
        text = pytesseract.image_to_string(img, lang="eng")
        texts.append(text)
    return "\n\n".join(texts)


def extract_answer_key_from_text(all_text: str) -> dict:
    """
    Looks for an answer key section at the end of the text.
    Format example: "1 (4) 2 (1) 3 (2)" or a table format.
    """
    answers = {}
    # Look for "Answer Key", "Answers", "Key" etc.
    key_sections = re.split(r"(?:Answer Key|Answers|Key Sheet|Solutions)", all_text, flags=re.IGNORECASE)
    if len(key_sections) > 1:
        # Take the last section
        key_text = key_sections[-1]
        # Look for patterns like "1.(2)" or "1 (2)" or "1 2"
        # We only want 1-4 or A-D
        pairs = re.findall(r"(\d{1,3})\s*[\.\s]*\(?([1-4A-D])\)?", key_text)
        for num, val in pairs:
            mapping = {'1': 'A', '2': 'B', '3': 'C', '4': 'D'}
            answers[int(num)] = mapping.get(val.upper(), val.upper())
    
    return answers


def parse_questions(all_text: str) -> List[ExtractedQuestion]:
    """
    Improved parser that detects questions, options, diagrams, and answers.
    """
    # Patterns for question start: "1.", "Q1.", "(1)", "1)", "1 " (lenient)
    q_pattern = re.compile(r"^\s*(?:Q[\.\s]*)?\(?(\d{1,3})(?:[\.\)]|\s+)\s*(.*)$", re.IGNORECASE)
    
    # Patterns for options: "(A)", "A.", "a)", "(a)" OR "(1)", "1.", "1)"
    opt_alpha_pattern = re.compile(r"^\s*\(?([A-D])\)?[Rank\.\)]\s*(.*)$", re.IGNORECASE)
    opt_num_pattern = re.compile(r"^\s*\(?([1-4])\)?[Rank\.\)]\s*(.*)$", re.IGNORECASE)

    # Keywords for diagram detection
    diagram_keywords = ["figure", "diagram", "circuit", "graph", "plot", "shown in"]

    raw_lines = all_text.splitlines()
    questions: List[ExtractedQuestion] = []
    
    # 1. Extract Answer Key if present
    answer_map = extract_answer_key_from_text(all_text)
    if answer_map:
        print(f"Detected answer key with {len(answer_map)} entries")

    current_q: Optional[dict] = None

    def map_opt(val: str) -> str:
        val = val.upper()
        mapping = {'1': 'A', '2': 'B', '3': 'C', '4': 'D'}
        return mapping.get(val, val)

    def flush_current():
        if current_q:
            # Clean up text
            text = " ".join(current_q['text_lines']).strip()
            
            # 2. Check for Diagram hints in text
            has_dia = any(k in text.lower() for k in diagram_keywords)
            
            # If we didn't find clear options, try to split the text if options are inline
            if not any([current_q['a'], current_q['b'], current_q['c'], current_q['d']]):
                parts = re.split(r"\s+\(?([A-D])\)?[Rank\.\)]\s+", text)
                if len(parts) <= 1:
                    parts = re.split(r"\s+\(?([1-4])\)?[Rank\.\)]\s+", text)
                
                if len(parts) > 1:
                    current_q['text_lines'] = [parts[0]]
                    text = parts[0].strip()
                    for i in range(1, len(parts), 2):
                        opt_let = map_opt(parts[i])
                        opt_val = parts[i+1].strip() if i+1 < len(parts) else ""
                        if opt_let == 'A': current_q['a'] = opt_val
                        elif opt_let == 'B': current_q['b'] = opt_val
                        elif opt_let == 'C': current_q['c'] = opt_val
                        elif opt_let == 'D': current_q['d'] = opt_val

            if text:
                qn = current_q['number']
                questions.append(
                    ExtractedQuestion(
                        question_number=qn,
                        question_text=text,
                        option_a=current_q['a'],
                        option_b=current_q['b'],
                        option_c=current_q['c'],
                        option_d=current_q['d'],
                        correct_option=answer_map.get(qn),
                        has_image=has_dia,
                        image_description="Diagram/Figure hinted in text" if has_dia else None,
                        confidence_score=0.8
                    )
                )

    for line in raw_lines:
        line = line.strip()
        if not line:
            continue

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
            mo_a = opt_alpha_pattern.match(line)
            mo_n = opt_num_pattern.match(line)
            mo = mo_a or mo_n
            if mo:
                opt_let = map_opt(mo.group(1))
                current_q['current_opt'] = opt_let
                current_q[opt_let.lower()] = mo.group(2)
            elif current_q['current_opt']:
                current_q[current_q['current_opt'].lower()] += " " + line
            else:
                current_q['text_lines'].append(line)

    flush_current()
    return questions


from fastapi.responses import HTMLResponse

@app.get("/", response_class=HTMLResponse)
def read_root():
    return r"""
    <html>
        <head>
            <title>OCR Service</title>
            <style>
                body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; background: #f4f7f6; }
                h1 { color: #333; }
                .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
                button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
                button:hover { background: #0056b3; }
                pre { background: #eee; padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
            </style>
        </head>
        <body>
            <h1>OCR Question Extractor</h1>
            <div class="card">
                <p>Status: <strong>Running</strong></p>
                <p>Enter a PDF or Image URL to test extraction:</p>
                <input type="text" id="fileUrl" placeholder="C:\Users\DELL\Downloads\paper.pdf" value="" onfocus="this.select()">
                <button onclick="testOCR()">Run Extraction</button>
                <div id="loading" style="display:none; margin-top: 10px; color: #666;">Processing... please wait (this can take 30-60s)</div>
                <h3>Result:</h3>
                <pre id="result">No data yet.</pre>
                
                <div style="margin-top: 20px; font-size: 0.9em; border-top: 1px solid #eee; padding-top: 10px; color: #666;">
                    <h4>Tips for Success:</h4>
                    <ul>
                        <li><strong>Numeric Options:</strong> (1)-(4) are automatically mapped to A-D.</li>
                        <li><strong>PDFs & Images:</strong> Both are now supported natively (no extra tools needed).</li>
                        <li><strong>Math Formulas:</strong> Local OCR extracts text. For high-fidelity LaTeX (squares/fractions), use the AI extraction button.</li>
                        <li><strong>Answer Key:</strong> Include the answers at the end of the paper for automatic marking!</li>
                    </ul>
                </div>
            </div>
            <script>
                function cleanUrl(url) {
                    // Remove accidental "https://...r2.dev/" prefix if user pasted over existing text
                    if (url.includes('file:///')) {
                        return 'file:///' + url.split('file:///')[1];
                    }
                    if (url.includes(':\\')) {
                        // Handle raw Windows paths that got merged
                        const parts = url.split(':');
                        if (parts.length > 2) {
                            return parts[parts.length-2].slice(-1) + ':' + parts[parts.length-1];
                        }
                    }
                    return url.trim();
                }

                async function testOCR() {
                    let url = document.getElementById('fileUrl').value;
                    url = cleanUrl(url);
                    document.getElementById('fileUrl').value = url;
                    
                    const resultElem = document.getElementById('result');
                    const loadingElem = document.getElementById('loading');
                    
                    if (!url) { alert('Please enter a URL'); return; }
                    
                    loadingElem.style.display = 'block';
                    resultElem.textContent = 'Processing... (Reading PDF pages and running OCR)';
                    
                    try {
                        const response = await fetch('/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ upload_id: 'browser_test', file_url: url })
                        });
                        const data = await response.json();
                        resultElem.textContent = JSON.stringify(data, null, 2);
                    } catch (e) {
                        resultElem.textContent = 'Error: ' + e.message;
                    } finally {
                        loadingElem.style.display = 'none';
                    }
                }
            </script>
        </body>
    </html>
    """


def process_with_mathpix(file_url: str, app_id: str, app_key: str):
    """Deep integration with Mathpix for JEE PDFs."""
    print(f"Submitting to Mathpix: {file_url}")
    try:
        # Submit
        resp = requests.post(
            "https://api.mathpix.com/v3/pdf",
            headers={"app_id": app_id, "app_key": app_key, "Content-Type": "application/json"},
            json={"url": file_url, "conversion_formats": {"mmd": true}}
        )
        pdf_id = resp.json().get("pdf_id")
        if not pdf_id:
            print(f"Mathpix Error: {resp.text}")
            return None

        # Poll for completion
        print(f"Mathpix PDF ID: {pdf_id}. Waiting for results...")
        for _ in range(30): # 5 minute timeout
            status_resp = requests.get(
                f"https://api.mathpix.com/v3/pdf/{pdf_id}",
                headers={"app_id": app_id, "app_key": app_key}
            )
            data = status_resp.json()
            status = data.get("status")
            if status == "completed":
                # Get Markdown result
                mmd_resp = requests.get(
                    f"https://api.mathpix.com/v3/pdf/{pdf_id}.mmd",
                    headers={"app_id": app_id, "app_key": app_key}
                )
                return mmd_resp.text
            elif status == "failed":
                print("Mathpix processing failed.")
                return None
            time.sleep(10)
        return None
    except Exception as e:
        print(f"Mathpix Connection Error: {e}")
        return None

def call_groq_ai(prompt: str, api_key: str):
    """Call Groq AI to structure the Mathpix Markdown."""
    if not api_key or "YOUR_GROQ_API_KEY" in api_key:
        print("Groq API Key missing. Falling back to regex.")
        return None
        
    print("Calling Groq AI for structured parsing...")
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": "You are a JEE Exam Parser. Extract questions into a strict JSON format. Handle MCQs, Numerical (Integer), and Matching Columns. Look for the Answer Key at the end of the text and map it to the correct question numbers."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            },
            timeout=60
        )
        data = resp.json()
        content = data['choices'][0]['message']['content']
        return json.loads(content).get("questions", [])
    except Exception as e:
        print(f"Groq Error: {e}")
        return None

@app.post("/", response_model=ExtractResponse)
def extract(req: ExtractRequest):
    print(f"Received extraction request for upload_id: {req.upload_id}")
    file_url = req.file_url.strip().strip('"').strip("'")
    
    # API Keys (Priority: Env -> Fallback)
    mathpix_id = os.getenv("MATHPIX_APP_ID") or "rkbexaminationportal_b6716f_fa7a82"
    mathpix_key = os.getenv("MATHPIX_APP_KEY") or "395cfd4b1202d3c2bd1586bcf6f2be11c78fc4d9f41d3a5521f68671dff13b57"
    groq_key = os.getenv("GROQ_API_KEY") or "YOUR_GROQ_API_KEY_HERE"
    
    mmd_content = None
    if file_url.lower().endswith(".pdf") or "pdf" in file_url.lower():
        mmd_content = process_with_mathpix(file_url, mathpix_id, mathpix_key)

    if mmd_content:
        print(f"Full MMD length: {len(mmd_content)}. Processing first 100,000 characters...")
        # Use AI to parse the beautiful Mathpix Markdown
        ai_prompt = f"""
        TASK: Convert this JEE Exam paper into a structured JSON array.
        THE PAPER HAS EXACTLY 90 QUESTIONS (usually 30 Physics, 30 Chemistry, 30 Math).
        
        TEXT: {mmd_content[:100000]} 

        STRICT RULES:
        1. NO DUPLICATES: Each question number (1-90) must appear only ONCE.
        2. QUESTION TYPES: Identify 'MCQ', 'NUMERICAL', or 'MATCH_COLUMN'.
        3. DIAGRAMS: Look for Mathpix image tags like '![image](...)' or '\\includegraphics'. 
           If a question text contains or is followed by an image tag, set "has_image": true and put the image description in "image_description".
        4. ANSWER KEY: The answer key at the very end is the GROUND TRUTH. 
           Map '1 (2)' to Question 1, Option B.
           Map '2 (3)' to Question 2, Option C.
        5. FORMAT: 
        {{ 
          "questions": [ 
            {{ 
              "question_number": 1, 
              "question_text": "...", 
              "question_type": "MCQ", 
              "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", 
              "correct_option": "A", 
              "suggested_marks": 4,
              "has_image": true,
              "image_description": "Circuit diagram with resistors"
            }} 
          ] 
        }}
        """
        questions_data = call_groq_ai(ai_prompt, groq_key)
        if questions_data:
            # Filter duplicates and ensure question count is reasonable
            seen_numbers = set()
            final_qs = []
            for q in questions_data:
                q_num = q.get("question_number")
                if q_num and q_num not in seen_numbers:
                    seen_numbers.add(q_num)
                    final_qs.append(ExtractedQuestion(**q))
            
            # Sort by question number
            final_qs.sort(key=lambda x: x.question_number)
            print(f"AI Extraction complete: found {len(final_qs)} unique questions.")
            return ExtractResponse(questions=final_qs, images=[])

    # 2. Fallback to Tesseract + Regex if AI/Mathpix fails
    data = None
    try:
        is_local = file_url.startswith("file:///") or (os.name == 'nt' and ':' in file_url and not file_url.startswith("http"))
        if is_local:
            path = unquote(file_url.replace("file:///", "").replace("/", os.sep))
            if os.path.exists(path):
                with open(path, "rb") as f: data = f.read()
        else:
            resp = requests.get(file_url, timeout=120)
            data = resp.content
    except Exception as e: print(f"File load error: {e}")

    if not data: return ExtractResponse(questions=[], images=[])

    all_text, pdf_images = pdf_to_text(data) if ".pdf" in file_url.lower() else (pytesseract.image_to_string(Image.open(io.BytesIO(data))), [])
    questions = parse_questions(all_text)
    return ExtractResponse(questions=questions, images=pdf_images)


if __name__ == "__main__":
    print("Starting OCR service on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8001)

