CREATE TABLE IF NOT EXISTS ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see and edit their own chat history
CREATE POLICY "Users can manage their own chat history"
ON ai_chat_history
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Cleanup function for 10 days (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_old_ai_chats()
RETURNS void AS \$\$
BEGIN
    DELETE FROM ai_chat_history WHERE updated_at < now() - interval '10 days';
END;
\$\$ LANGUAGE plpgsql;
