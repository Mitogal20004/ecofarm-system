begin;

alter table public.ventas
  add column if not exists metodo_pago text not null default 'efectivo',
  add column if not exists stripe_payment_intent_id text;

do $bloque$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ventas_metodo_pago_check'
      and conrelid = 'public.ventas'::regclass
  ) then
    alter table public.ventas
      add constraint ventas_metodo_pago_check
        check (metodo_pago in ('efectivo', 'tarjeta'));
  end if;
end
$bloque$;

create unique index if not exists ventas_stripe_payment_intent_id_unico
  on public.ventas (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create or replace function public.confirmar_venta(
  p_clave_idempotencia uuid,
  p_cliente_id uuid,
  p_comprador_nombre text,
  p_comprador_nit text,
  p_comprador_direccion text,
  p_observaciones text,
  p_detalles jsonb,
  p_monto_recibido numeric,
  p_metodo_pago text,
  p_stripe_payment_intent_id text,
  p_generar_recibo boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $funcion$
declare
  v_resultado jsonb;
  v_venta_id uuid;
begin
  if p_metodo_pago not in ('efectivo', 'tarjeta')
    or (p_metodo_pago = 'tarjeta' and p_stripe_payment_intent_id is null)
    or (p_metodo_pago = 'efectivo' and p_stripe_payment_intent_id is not null)
  then
    raise exception using errcode = '22023', message = 'El método de pago no es válido.';
  end if;

  v_resultado := public.confirmar_venta(
    p_clave_idempotencia,
    p_cliente_id,
    p_comprador_nombre,
    p_comprador_nit,
    p_comprador_direccion,
    p_observaciones,
    p_detalles,
    p_monto_recibido,
    p_generar_recibo
  );

  v_venta_id := (v_resultado #>> '{venta,id}')::uuid;

  if p_metodo_pago = 'tarjeta'
    and p_monto_recibido <> (v_resultado #>> '{venta,total}')::numeric
  then
    raise exception using
      errcode = '23514',
      message = 'El monto pagado no coincide con el total de la Venta.';
  end if;

  update public.ventas
  set
    metodo_pago = p_metodo_pago,
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    fecha_actualizacion = now()
  where id = v_venta_id;

  return jsonb_set(
    v_resultado,
    '{venta}',
    (select to_jsonb(venta) from public.ventas as venta where venta.id = v_venta_id)
  );
end;
$funcion$;

commit;
