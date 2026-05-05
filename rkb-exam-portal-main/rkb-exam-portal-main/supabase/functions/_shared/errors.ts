// User-friendly error messages mapping
export const USER_FRIENDLY_ERRORS: Record<string, { message: string; code: string }> = {
  'invalid credentials': { 
    message: 'Invalid email or date of birth. Please check your credentials.', 
    code: 'INVALID_CREDENTIALS' 
  },
  'session not found': { 
    message: 'Your exam session has expired. Please contact administration.', 
    code: 'SESSION_EXPIRED' 
  },
  'exam already submitted': { 
    message: 'You have already submitted this exam.', 
    code: 'ALREADY_SUBMITTED' 
  },
  'already completed': { 
    message: 'You have already completed this exam.', 
    code: 'ALREADY_COMPLETED' 
  },
  'already been evaluated': { 
    message: 'Your exam has already been evaluated.', 
    code: 'ALREADY_EVALUATED' 
  },
  'exam_login_enabled': { 
    message: 'Exam login is not enabled for your registration. Please contact administration.', 
    code: 'LOGIN_DISABLED' 
  },
  'pending approval': { 
    message: 'Your registration is pending approval. Please wait for confirmation.', 
    code: 'PENDING_APPROVAL' 
  },
  'not registered': { 
    message: 'You are not registered for this exam.', 
    code: 'NOT_REGISTERED' 
  },
  'date of birth not set': { 
    message: 'Your date of birth is not set in the system. Please contact administration.', 
    code: 'DOB_NOT_SET' 
  },
  'exam is not available': { 
    message: 'This exam is not currently available for taking.', 
    code: 'EXAM_UNAVAILABLE' 
  },
  'not available at this time': { 
    message: 'Exam is not available at this time. Please check the exam schedule.', 
    code: 'OUTSIDE_TIME_WINDOW' 
  },
  'no questions available': { 
    message: 'No questions are available for this exam. Please contact administration.', 
    code: 'NO_QUESTIONS' 
  },
  'session expired': {
    message: 'Your exam session has expired. Please contact administration.',
    code: 'SESSION_EXPIRED'
  },
  'finally_submitted': {
    message: 'You have already submitted this exam. No further changes are allowed.',
    code: 'ALREADY_SUBMITTED'
  }
};

/**
 * Get a user-friendly error message from a raw error string
 */
export function getUserFriendlyError(rawError: string): { message: string; code: string } {
  const lowerError = rawError.toLowerCase();
  
  for (const [key, value] of Object.entries(USER_FRIENDLY_ERRORS)) {
    if (lowerError.includes(key)) {
      return value;
    }
  }
  
  // Default error
  return { 
    message: 'An error occurred. Please try again or contact administration.', 
    code: 'UNKNOWN_ERROR' 
  };
}

/**
 * Create a structured error response for edge functions
 */
export function createErrorResponse(
  rawError: string, 
  statusCode: number = 400,
  corsHeaders: Record<string, string> = {}
): Response {
  const { message, code } = getUserFriendlyError(rawError);
  
  console.error(`[ERROR] ${code}: ${rawError}`);
  
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      error_code: code,
      // raw_error is only for logging, not shown to users
    }),
    { 
      status: statusCode, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
