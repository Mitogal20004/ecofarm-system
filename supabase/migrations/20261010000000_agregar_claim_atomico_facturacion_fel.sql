begin;

-- Un resultado incierto exige conciliación con el certificador. Mientras esta
-- marca esté activa, el claim normal no puede reenviar el documento.
alter table public.facturas_fel
  add column requiere_conciliacion boolean not null default false,
  add constraint facturas_fel_conciliacion_check
    check (not requiere_conciliacion or estado = 'error');

create unique index facturas_fel_token_procesamiento_unico
  on public.facturas_fel (token_procesamiento)
  where token_procesamiento is not null;

create index indice_facturas_fel_pendientes_conciliacion
  on public.facturas_fel (fecha_actualizacion, id)
  where requiere_conciliacion is true;


-- El UPDATE condicional constituye el claim: PostgreSQL bloquea la fila y
-- vuelve a evaluar el predicado después de cualquier espera concurrente. Solo
-- un trabajador puede cambiar pendiente/error a procesando y recibir el token.
create function public.reclamar_factura_fel(
  p_factura_id uuid,
  p_xml_solicitud text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_factura public.facturas_fel%rowtype;
  v_token uuid;
  v_ahora timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  if p_factura_id is null
    or (p_xml_solicitud is not null and btrim(p_xml_solicitud) = '')
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_token := gen_random_uuid();
  v_ahora := clock_timestamp();

  update public.facturas_fel as factura
  set
    estado = 'procesando',
    xml_solicitud = coalesce(
      factura.xml_solicitud,
      p_xml_solicitud
    ),
    respuesta_certificador = null,
    mensaje_error = null,
    cantidad_intentos = factura.cantidad_intentos + 1,
    token_procesamiento = v_token,
    fecha_inicio_procesamiento = v_ahora,
    fecha_actualizacion = v_ahora,
    requiere_conciliacion = false
  where factura.id = p_factura_id
    and (
      factura.estado = 'pendiente'
      or (
        factura.estado = 'error'
        and factura.requiere_conciliacion is false
      )
    )
    and (
      factura.xml_solicitud is not null
      or p_xml_solicitud is not null
    )
  returning factura.* into v_factura;

  if found then
    return jsonb_build_object(
      'reclamada', true,
      'factura', jsonb_build_object(
        'id', v_factura.id,
        'venta_id', v_factura.venta_id,
        'estado', v_factura.estado,
        'tipo_documento', v_factura.tipo_documento,
        'nit_receptor_snapshot', v_factura.nit_receptor_snapshot,
        'nombre_receptor_snapshot', v_factura.nombre_receptor_snapshot,
        'direccion_receptor_snapshot',
          v_factura.direccion_receptor_snapshot,
        'total_snapshot', v_factura.total_snapshot,
        'xml_solicitud', v_factura.xml_solicitud,
        'cantidad_intentos', v_factura.cantidad_intentos,
        'token_procesamiento', v_factura.token_procesamiento,
        'fecha_inicio_procesamiento',
          v_factura.fecha_inicio_procesamiento,
        'requiere_conciliacion', v_factura.requiere_conciliacion
      )
    );
  end if;

  select factura.*
  into v_factura
  from public.facturas_fel as factura
  where factura.id = p_factura_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La factura solicitada no existe.';
  end if;

  if v_factura.estado = 'pendiente'
    and v_factura.xml_solicitud is null
    and p_xml_solicitud is null
  then
    raise exception using
      errcode = '22023',
      message = 'La factura no tiene un XML de solicitud válido.';
  end if;

  return jsonb_build_object(
    'reclamada', false,
    'factura', jsonb_build_object(
      'id', v_factura.id,
      'venta_id', v_factura.venta_id,
      'estado', v_factura.estado,
      'cantidad_intentos', v_factura.cantidad_intentos,
      'requiere_conciliacion', v_factura.requiere_conciliacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.reclamar_factura_fel(uuid, text)
  from public;
revoke execute
  on function public.reclamar_factura_fel(uuid, text)
  from anon;
revoke execute
  on function public.reclamar_factura_fel(uuid, text)
  from authenticated;
grant execute
  on function public.reclamar_factura_fel(uuid, text)
  to service_role;


-- La finalización compara el token del claim. Un trabajador atrasado nunca
-- puede sobrescribir el resultado de otro. Los resultados inciertos quedan
-- bloqueados para reintento hasta implementar la conciliación con TEKRA.
create function public.finalizar_factura_fel(
  p_factura_id uuid,
  p_token_procesamiento uuid,
  p_resultado text,
  p_uuid_fel uuid default null,
  p_serie_fel text default null,
  p_numero_fel text default null,
  p_fecha_certificacion timestamptz default null,
  p_xml_certificado text default null,
  p_respuesta_certificador jsonb default null,
  p_mensaje_error text default null,
  p_pdf_storage_path text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_resultado text;
  v_serie_fel text;
  v_numero_fel text;
  v_mensaje_error text;
  v_pdf_storage_path text;
  v_factura public.facturas_fel%rowtype;
  v_ahora timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'No tiene permiso para realizar esta acción.';
  end if;

  v_resultado := nullif(lower(btrim(p_resultado)), '');
  v_serie_fel := nullif(btrim(p_serie_fel), '');
  v_numero_fel := nullif(btrim(p_numero_fel), '');
  v_mensaje_error := nullif(
    btrim(regexp_replace(p_mensaje_error, '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_pdf_storage_path := nullif(btrim(p_pdf_storage_path), '');

  if p_factura_id is null
    or p_token_procesamiento is null
    or v_resultado is null
    or v_resultado not in (
      'certificada',
      'error_reintentable',
      'resultado_incierto'
    )
    or (
      p_respuesta_certificador is not null
      and jsonb_typeof(p_respuesta_certificador) <> 'object'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if v_resultado = 'certificada' and (
    p_uuid_fel is null
    or v_serie_fel is null
    or v_numero_fel is null
    or char_length(v_serie_fel) > 100
    or char_length(v_numero_fel) > 100
    or p_fecha_certificacion is null
    or p_xml_certificado is null
    or btrim(p_xml_certificado) = ''
    or p_mensaje_error is not null
    or (
      p_pdf_storage_path is not null
      and v_pdf_storage_path is null
    )
    or char_length(v_pdf_storage_path) > 1000
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  if v_resultado in ('error_reintentable', 'resultado_incierto') and (
    v_mensaje_error is null
    or char_length(v_mensaje_error) > 1000
    or p_uuid_fel is not null
    or p_serie_fel is not null
    or p_numero_fel is not null
    or p_fecha_certificacion is not null
    or p_xml_certificado is not null
    or p_pdf_storage_path is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Los parámetros proporcionados no son válidos.';
  end if;

  v_ahora := clock_timestamp();

  if v_resultado = 'certificada' then
    update public.facturas_fel as factura
    set
      estado = 'certificada',
      uuid_fel = p_uuid_fel,
      serie_fel = v_serie_fel,
      numero_fel = v_numero_fel,
      fecha_certificacion = p_fecha_certificacion,
      xml_certificado = p_xml_certificado,
      pdf_storage_path = v_pdf_storage_path,
      respuesta_certificador = p_respuesta_certificador,
      mensaje_error = null,
      token_procesamiento = null,
      fecha_inicio_procesamiento = null,
      fecha_actualizacion = v_ahora,
      requiere_conciliacion = false
    where factura.id = p_factura_id
      and factura.estado = 'procesando'
      and factura.token_procesamiento = p_token_procesamiento
    returning factura.* into v_factura;
  else
    update public.facturas_fel as factura
    set
      estado = 'error',
      uuid_fel = null,
      serie_fel = null,
      numero_fel = null,
      fecha_certificacion = null,
      xml_certificado = null,
      pdf_storage_path = null,
      respuesta_certificador = p_respuesta_certificador,
      mensaje_error = v_mensaje_error,
      token_procesamiento = null,
      fecha_inicio_procesamiento = null,
      fecha_actualizacion = v_ahora,
      requiere_conciliacion = (
        v_resultado = 'resultado_incierto'
      )
    where factura.id = p_factura_id
      and factura.estado = 'procesando'
      and factura.token_procesamiento = p_token_procesamiento
    returning factura.* into v_factura;
  end if;

  if not found then
    if not exists (
      select 1
      from public.facturas_fel as factura
      where factura.id = p_factura_id
    ) then
      raise exception using
        errcode = 'P0002',
        message = 'La factura solicitada no existe.';
    end if;

    raise exception using
      errcode = '23514',
      message = 'El claim de la factura no es válido o ya finalizó.';
  end if;

  return jsonb_build_object(
    'factura', jsonb_build_object(
      'id', v_factura.id,
      'venta_id', v_factura.venta_id,
      'estado', v_factura.estado,
      'uuid_fel', v_factura.uuid_fel,
      'serie_fel', v_factura.serie_fel,
      'numero_fel', v_factura.numero_fel,
      'fecha_certificacion', v_factura.fecha_certificacion,
      'cantidad_intentos', v_factura.cantidad_intentos,
      'requiere_conciliacion', v_factura.requiere_conciliacion,
      'fecha_actualizacion', v_factura.fecha_actualizacion
    )
  );
end;
$funcion$;

revoke execute
  on function public.finalizar_factura_fel(
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    timestamptz,
    text,
    jsonb,
    text,
    text
  )
  from public;
revoke execute
  on function public.finalizar_factura_fel(
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    timestamptz,
    text,
    jsonb,
    text,
    text
  )
  from anon;
revoke execute
  on function public.finalizar_factura_fel(
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    timestamptz,
    text,
    jsonb,
    text,
    text
  )
  from authenticated;
grant execute
  on function public.finalizar_factura_fel(
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    timestamptz,
    text,
    jsonb,
    text,
    text
  )
  to service_role;

commit;
