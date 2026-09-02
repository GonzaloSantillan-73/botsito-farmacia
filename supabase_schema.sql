-- 1. Create Conversations Table
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone VARCHAR(20) NOT NULL,
    client_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_validation', 'resolved')),
    assigned_to UUID, -- Optional: references auth.users(id) for agent assignment
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 2. Create Messages Table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('client', 'agent', 'bot')),
    message_text TEXT,
    media_url TEXT,
    media_type VARCHAR(20) CHECK (media_type IN ('text', 'image', 'document')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 3. Create Prescriptions Table
CREATE TABLE public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    obra_social VARCHAR(100),
    notes TEXT,
    validated_by UUID, -- Optional: references auth.users(id) for tracking who validated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Indexes for performance
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_prescriptions_conversation_id ON public.prescriptions(conversation_id);
CREATE INDEX idx_prescriptions_status ON public.prescriptions(status);

-- Function to update updated_at on conversations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_modtime
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 4. Modificaciones posteriores
ALTER TABLE public.conversations ADD COLUMN last_message TEXT;
