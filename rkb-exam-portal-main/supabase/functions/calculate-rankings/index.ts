import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalculateRankingsData {
  exam_id: string;
}

Deno.serve(async (req) => {
  console.log(`[CALCULATE-RANKINGS] === Request Started: ${new Date().toISOString()} ===`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[CALCULATE-RANKINGS] Using Portal Database');

    const data: CalculateRankingsData = await req.json();
    console.log('[CALCULATE-RANKINGS] Data:', data);

    if (!data.exam_id) {
      return new Response(
        JSON.stringify({ error: 'Missing exam_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all results for this exam
    console.log(`[CALCULATE-RANKINGS] Fetching results for exam: ${data.exam_id}`);
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select('id, obtained_marks, wrong_count, calculated_at, section_wise_scores')
      .eq('exam_id', data.exam_id);

    if (resultsError) {
      console.error('[CALCULATE-RANKINGS] Error fetching results:', resultsError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch results: ${resultsError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!results || results.length === 0) {
      console.log('[CALCULATE-RANKINGS] No results found');
      return new Response(
        JSON.stringify({ error: 'No results found for this exam' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CALCULATE-RANKINGS] Found ${results.length} results to rank`);

    // Robust Sort Function
    const sortedResults = [...results].sort((a, b) => {
      // 1. Total marks (descending)
      const aMarks = a.obtained_marks ?? 0;
      const bMarks = b.obtained_marks ?? 0;
      if (aMarks !== bMarks) {
        return bMarks - aMarks;
      }

      // 2. Tie-breaker 1: Mathematics marks (descending)
      const aMaths = (a.section_wise_scores as any)?.Mathematics?.marks || 0;
      const bMaths = (b.section_wise_scores as any)?.Mathematics?.marks || 0;
      if (aMaths !== bMaths) {
        return bMaths - aMaths;
      }

      // 3. Tie-breaker 2: Wrong count (ascending - fewer is better)
      const aWrong = a.wrong_count ?? 0;
      const bWrong = b.wrong_count ?? 0;
      if (aWrong !== bWrong) {
        return aWrong - bWrong;
      }

      // 4. Tie-breaker 3: Earlier submission (ascending)
      const aTime = a.calculated_at ? new Date(a.calculated_at).getTime() : 0;
      const bTime = b.calculated_at ? new Date(b.calculated_at).getTime() : 0;
      return aTime - bTime;
    });

    // Update ranks sequentially
    console.log('[CALCULATE-RANKINGS] Starting rank updates...');
    let updateCount = 0;
    for (let i = 0; i < sortedResults.length; i++) {
      const rank = i + 1;
      const result = sortedResults[i];

      const { error: updateError } = await supabase
        .from('results')
        .update({ rank })
        .eq('id', result.id);

      if (updateError) {
        console.error(`[CALCULATE-RANKINGS] Error updating rank ${rank} for result ${result.id}:`, updateError);
      } else {
        updateCount++;
      }
    }

    console.log(`[CALCULATE-RANKINGS] Successfully updated ranks for ${updateCount} students`);

    return new Response(
      JSON.stringify({
        success: true,
        total_results: results.length,
        ranks_updated: updateCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[CALCULATE-RANKINGS] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error?.message || 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

