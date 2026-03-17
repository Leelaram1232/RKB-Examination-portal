import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalculateRankingsData {
  exam_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const data: CalculateRankingsData = await req.json();
    console.log('Calculate rankings request:', data);

    if (!data.exam_id) {
      return new Response(
        JSON.stringify({ error: 'Missing exam_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all results for this exam
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select('id, obtained_marks, wrong_count, calculated_at, section_wise_scores')
      .eq('exam_id', data.exam_id)
      .order('obtained_marks', { ascending: false });

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No results found for this exam' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${results.length} results to rank`);

    // Sort results by:
    // 1. Total marks (descending)
    // 2. Mathematics marks (descending) - tie-breaker 1
    // 3. Wrong count (ascending) - tie-breaker 2
    // 4. Calculated at (ascending) - tie-breaker 3
    const sortedResults = [...results].sort((a, b) => {
      // Primary: obtained_marks descending
      if (a.obtained_marks !== b.obtained_marks) {
        return b.obtained_marks - a.obtained_marks;
      }

      // Tie-breaker 1: Mathematics marks descending
      const aMaths = (a.section_wise_scores as any)?.Mathematics?.marks || 0;
      const bMaths = (b.section_wise_scores as any)?.Mathematics?.marks || 0;
      if (aMaths !== bMaths) {
        return bMaths - aMaths;
      }

      // Tie-breaker 2: Wrong count ascending (fewer is better)
      if (a.wrong_count !== b.wrong_count) {
        return a.wrong_count - b.wrong_count;
      }

      // Tie-breaker 3: Earlier submission (ascending)
      const aTime = new Date(a.calculated_at).getTime();
      const bTime = new Date(b.calculated_at).getTime();
      return aTime - bTime;
    });

    // Update ranks
    let updateCount = 0;
    for (let i = 0; i < sortedResults.length; i++) {
      const rank = i + 1;
      const result = sortedResults[i];

      const { error: updateError } = await supabase
        .from('results')
        .update({ rank })
        .eq('id', result.id);

      if (updateError) {
        console.error(`Error updating rank for result ${result.id}:`, updateError);
      } else {
        updateCount++;
      }
    }

    console.log(`Updated ranks for ${updateCount} results`);

    return new Response(
      JSON.stringify({
        success: true,
        total_results: results.length,
        ranks_updated: updateCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
