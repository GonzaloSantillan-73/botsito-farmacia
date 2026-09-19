-- Función atómica: la identidad "de verdad" de una persona pasa a ser su DNI,
-- no el client_phone desde el que escribe (que puede cambiar si recicla su
-- línea o cambia de compañía). Se llama SÓLO desde el registro OBLIGATORIO de
-- un teléfono nuevo (ver server/services/clientes.js: migrarOCrearClientePorDni,
-- usada por server/services/bot.js en el paso registro_dni), justo después de
-- que el cliente termina de escribir su DNI por primera vez en ESE teléfono:
--
--   - Si el DNI ya tenía ficha bajo OTRO teléfono (mismo cliente, número
--     nuevo): migra esa ficha vieja al teléfono actual, arrastrando también
--     su historial de conversations/pedidos_confirmados/pedidos_cotizados —
--     para que el Directorio de Clientes lo siga mostrando como una sola
--     persona con toda su consulta anterior, en vez de una ficha "fantasma"
--     bajo el número viejo y otra nueva sin historial. De paso, borra
--     cualquier fila que ya estuviera ocupando el teléfono nuevo (el
--     "placeholder" que deja el paso anterior del registro, registro_nombre,
--     antes de saber si iba a haber migración; o, en el caso raro de una
--     línea reciclada, la ficha de otra persona que ya no la usa).
--   - Si el DNI no existe en ningún lado (o ya es de este mismo teléfono):
--     alta/actualización normal, upsert por client_phone como ya funcionaba.
--
-- Todo dentro de una sola transacción de Postgres (la función completa es
-- atómica: si algo falla a mitad de camino, Postgres deshace todo), y con un
-- SELECT ... FOR UPDATE para serializar dos webhooks casi simultáneos con el
-- mismo DNI. Requiere el índice único de clientes_dni_unique_index.sql: sin
-- él, dos ALTAS nuevas (DNI nunca antes visto) en paralelo podrían colarse
-- las dos a la vez sin que la base las bloquee — con el índice, la segunda
-- falla con unique_violation (23505) y el llamador la reintenta una vez (ver
-- migrarOCrearClientePorDni en clientes.js).
CREATE OR REPLACE FUNCTION public.migrar_cliente_por_dni(
  p_dni TEXT,
  p_telefono_nuevo TEXT,
  p_nombre_completo TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_existente public.clientes%ROWTYPE;
  v_telefono_viejo TEXT;
  v_resultado public.clientes%ROWTYPE;
  v_accion TEXT;
BEGIN
  IF p_dni IS NULL OR btrim(p_dni) = '' THEN
    RAISE EXCEPTION 'p_dni no puede estar vacío';
  END IF;
  IF p_telefono_nuevo IS NULL OR btrim(p_telefono_nuevo) = '' THEN
    RAISE EXCEPTION 'p_telefono_nuevo no puede estar vacío';
  END IF;

  SELECT * INTO v_existente FROM public.clientes WHERE dni = p_dni FOR UPDATE;

  IF FOUND AND v_existente.client_phone <> p_telefono_nuevo THEN
    -- Migración: el DNI ya tenía ficha, pero en otro teléfono.
    v_telefono_viejo := v_existente.client_phone;

    DELETE FROM public.clientes WHERE client_phone = p_telefono_nuevo AND id <> v_existente.id;

    UPDATE public.clientes
    SET client_phone = p_telefono_nuevo,
        nombre_completo = COALESCE(p_nombre_completo, nombre_completo),
        -- Compensa el +1 que ya se le había sumado al placeholder del
        -- teléfono nuevo (ver incrementarInteraccionesBot en clientes.js,
        -- llamado antes de saber si esto iba a terminar en migración): esa
        -- fila se acaba de borrar arriba, así que el +1 de esta sesión se
        -- contabiliza acá, sobre la ficha que en verdad sobrevive.
        interacciones_bot = interacciones_bot + 1,
        updated_at = now()
    WHERE id = v_existente.id
    RETURNING * INTO v_resultado;

    UPDATE public.conversations SET client_phone = p_telefono_nuevo WHERE client_phone = v_telefono_viejo;
    UPDATE public.pedidos_confirmados SET client_phone = p_telefono_nuevo WHERE client_phone = v_telefono_viejo;
    UPDATE public.pedidos_cotizados SET client_phone = p_telefono_nuevo WHERE client_phone = v_telefono_viejo;

    v_accion := 'migrado';
  ELSE
    INSERT INTO public.clientes (client_phone, dni, nombre_completo)
    VALUES (p_telefono_nuevo, p_dni, p_nombre_completo)
    ON CONFLICT (client_phone) DO UPDATE
      SET dni = EXCLUDED.dni,
          nombre_completo = COALESCE(EXCLUDED.nombre_completo, public.clientes.nombre_completo),
          updated_at = now()
    RETURNING * INTO v_resultado;

    v_accion := 'alta';
  END IF;

  RETURN jsonb_build_object('accion', v_accion, 'cliente', to_jsonb(v_resultado));
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrar_cliente_por_dni(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
