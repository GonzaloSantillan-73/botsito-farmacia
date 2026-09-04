-- Palabra clave configurable con la que un cliente reactiva al bot cuando está en
-- modo humano (por defecto "BOT"). Usa la misma tabla app_settings del límite de sesión.
INSERT INTO public.app_settings (key, value) VALUES ('bot_reactivation_keyword', '"BOT"')
ON CONFLICT (key) DO NOTHING;
