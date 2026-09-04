-- 1. Create Tables
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT,
    client_name TEXT,
    status TEXT DEFAULT 'pending_validation' CHECK (status IN ('open', 'pending_validation', 'preparation', 'ready', 'resolved', 'rejected', 'esperando', 'finalizada')),
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT CHECK (sender_type IN ('client', 'agent', 'bot')),
    message_text TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text' CHECK (media_type IN ('text', 'image', 'document')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    image_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    obra_social TEXT,
    notes TEXT,
    validated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- 3. Create Permissive Policies for Development
CREATE POLICY "Allow all on conversations" ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on prescriptions" ON public.prescriptions FOR ALL USING (true) WITH CHECK (true);

-- 4. Enable Realtime
-- Drop existing publication if modifying, or just add to the default 'supabase_realtime' publication
BEGIN;
  -- Remove tables from the publication first to avoid errors if they already exist
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.conversations, public.messages, public.prescriptions;
  -- Add them back
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations, public.messages, public.prescriptions;
COMMIT;

-- 5. Insert Seed Data
-- 5.1 Patient 1: María (Pending Validation)
WITH new_conv_1 AS (
    INSERT INTO public.conversations (id, client_phone, client_name, status)
    VALUES (gen_random_uuid(), '+54 11 1234-5678', 'María Gómez', 'pending_validation')
    RETURNING id
)
-- Patient 1 Messages
, msg_1_1 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, created_at)
    SELECT id, 'bot', '¡Hola! Bienvenido a Farmacia Central. ¿En qué podemos ayudarte?', now() - interval '10 minutes' FROM new_conv_1
)
, msg_1_2 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, created_at)
    SELECT id, 'client', 'Hola, necesito saber si me pueden preparar esta receta', now() - interval '8 minutes' FROM new_conv_1
)
, msg_1_3 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, media_url, media_type, created_at)
    SELECT id, 'client', 'Adjunto la imagen de la receta médica.', 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800', 'image', now() - interval '5 minutes' FROM new_conv_1
)
-- Patient 1 Prescription
INSERT INTO public.prescriptions (conversation_id, image_url, status)
SELECT id, 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800', 'pending' FROM new_conv_1;

-- 5.2 Patient 2: Juan (Open)
WITH new_conv_2 AS (
    INSERT INTO public.conversations (id, client_phone, client_name, status)
    VALUES (gen_random_uuid(), '+54 11 8765-4321', 'Juan Pérez', 'open')
    RETURNING id
)
-- Patient 2 Messages
, msg_2_1 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, created_at)
    SELECT id, 'bot', '¡Hola! Bienvenido a Farmacia Central.', now() - interval '2 days' FROM new_conv_2
)
, msg_2_2 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, created_at)
    SELECT id, 'client', 'Tienen stock de Ibuprofeno 600?', now() - interval '1 day' FROM new_conv_2
)
, msg_2_3 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, created_at)
    SELECT id, 'agent', 'Sí, tenemos amplio stock. ¿Deseas que te reservemos uno?', now() - interval '23 hours' FROM new_conv_2
)
, msg_2_4 AS (
    INSERT INTO public.messages (conversation_id, sender_type, message_text, created_at)
    SELECT id, 'client', 'Sí por favor. En un rato paso.', now() - interval '20 hours' FROM new_conv_2
)
-- Patient 2 Prescription (Optional, adding an approved one for context)
INSERT INTO public.prescriptions (conversation_id, image_url, status, obra_social, notes)
SELECT id, 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=800', 'approved', 'OSDE', 'Aprobado automáticamente por historial' FROM new_conv_2;
