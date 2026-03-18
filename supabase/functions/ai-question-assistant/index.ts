import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AssistantRequest {
  messages: Message[];
  file_url?: string;
  exam_id?: string;
  subject_id?: string;
}

async function callMathpixPdf(fileUrl: string, appId: string, appKey: string): Promise<string> {
  console.log('[Mathpix] Submitting PDF for processing:', fileUrl);
  
  const submitResp = await fetch('https://api.mathpix.com/v3/pdf', {
    method: 'POST',
    headers: {
      'app_id': appId,
      'app_key': appKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: fileUrl,
      conversion_formats: { mmd: true },
    }),
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`Mathpix submission failed (${submitResp.status}): ${err}`);
  }

  const { pdf_id } = await submitResp.json();
  
  // Poll for completion (max 40s to leave room for Groq and network)
  let attempts = 0;
  while (attempts < 20) {
    const statusResp = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
      headers: { 'app_id': appId, 'app_key': appKey },
    });
    
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      if (statusData.status === 'completed') {
        const mmdResp = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.mmd`, {
          headers: { 'app_id': appId, 'app_key': appKey },
        });
        return await mmdResp.text();
      } else if (statusData.status === 'failed') {
        throw new Error(`Mathpix processing failed`);
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
  throw new Error('OCR taking too long. Please wait a few seconds and try sending your message again.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const groqKey = Deno.env.get('GROQ_API_KEY');
    const mathpixId = Deno.env.get('MATHPIX_APP_ID');
    const mathpixKey = Deno.env.get('MATHPIX_APP_KEY');
    
    if (!groqKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const { messages, file_url, exam_id, subject_id } = await req.json() as AssistantRequest;
    console.log('[Assistant] Request received:', { 
      messageCount: messages?.length, 
      hasFile: !!file_url,
      exam_id,
      subject_id 
    });

    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    let ocrContext = '';
    if (file_url) {
      if (!mathpixId || !mathpixKey) {
        console.warn('[Assistant] File uploaded but Mathpix keys are missing.');
        ocrContext = 'Error: Mathpix OCR keys not configured on server.';
      } else {
        try {
          ocrContext = await callMathpixPdf(file_url, mathpixId, mathpixKey);
          console.log('[Assistant] OCR success, length:', ocrContext.length);
          
          // Truncate extremely large OCR text to prevent memory crashes
          if (ocrContext.length > 50000) {
            console.log('[Assistant] Truncating OCR text from', ocrContext.length, 'to 50000');
            ocrContext = ocrContext.substring(0, 50000) + '... [TRUNCATED DUE TO SIZE]';
          }
        } catch (e: any) {
          console.error('[Assistant] OCR failed:', e);
          ocrContext = `Error: Could not extract text from file: ${e.message}`;
        }
      }
    }

    // Ensure we don't send empty user messages to Groq
    const sanitizedMessages = messages.map(m => {
      // If a message is very long (e.g. from a previous OCR run), we might want to keep it but be careful
      return {
        role: m.role,
        content: m.content || (m.role === 'user' ? '[No text content provided]' : '')
      };
    });

    const systemPrompt = `You are an expert Exam Question Assistant for JEE/NEET.
Generate or extract high-quality questions based on the provided context or prompt.

### QUESTION TYPES
1. **MCQ**: Default. 4 options (option_a to option_d), correct_option (A/B/C/D).
2. **FILL_BLANK**: Only if requested. No options required. Needs correct_answer.

### CRITICAL OUTPUT RULES
- **JSON ONLY**: When generating questions, DO NOT list them in plain text. Only provide a brief introductory sentence, followed by the structured JSON block.
- **TAGS**: You MUST wrap the JSON array inside <questions_json> and </questions_json> tags at the very end of your response.
- **MCQ IS DEFAULT**: Unless "numerical" or "fill in blank" is requested, always stick to MCQ.
- **AVOID REPETITION**: Never repeat a question from the conversation history.

### JSON SCHEMA
[
  {
    "question_text": "text with LaTeX $...$",
    "question_type": "MCQ" | "FILL_BLANK",
    "option_a": "Text...", "option_b": "Text...", "option_c": "Text...", "option_d": "Text...",
    "correct_option": "A|B|C|D",
    "correct_answer": "Numerical/Textual answer",
    "section_name": "Section A",
    "marks": 4
  }
]

Current context:
${ocrContext ? `OCR Extracted Content: \n${ocrContext}` : 'No file uploaded.'}
Subject ID: ${subject_id || 'Not specified'}
Exam ID: ${exam_id || 'Not specified'}`;

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...sanitizedMessages
    ];

    console.log('[Assistant] Calling Groq with model: llama-3.3-70b-versatile');
    const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        temperature: 0.2,
      }),
    });

    if (!groqResp.ok) {
      const errText = await groqResp.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch(e) {}
      const errMsg = errJson?.error?.message || errText;
      console.error('[Assistant] Groq API returned error:', errMsg);
      throw new Error(`Groq API Error: ${errMsg}`);
    }

    const groqData = await groqResp.json();
    const assistantContent = groqData.choices[0].message.content;
    console.log('[Assistant] RAW CONTENT:', assistantContent.substring(0, 500) + '...');

    // Extract JSON if present
    const jsonMatch = assistantContent.match(/<questions_json>\s*([\s\S]*?)\s*<\/questions_json>/i);
    let questions = [];
    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1].trim();
        questions = JSON.parse(jsonStr);
        console.log(`[Assistant] Successfully extracted ${questions.length} questions.`);
      } catch (e: any) {
        console.error('[Assistant] Failed to parse JSON:', e.message);
      }
    } else {
      console.warn('[Assistant] No <questions_json> tags found.');
    }

    const cleanedContent = assistantContent.replace(/<questions_json>[\s\S]*?<\/questions_json>/i, '').trim();

    return new Response(JSON.stringify({ 
      content: cleanedContent,
      questions 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Assistant] Error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
