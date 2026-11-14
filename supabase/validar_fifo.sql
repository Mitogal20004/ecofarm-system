-- Consultas de verificación posteriores a la prueba manual FIFO.
-- Son de solo lectura.

select id, codigo, variante_id, estado, cantidad_inicial, cantidad_disponible,
       fecha_origen, costo_unitario
from public.lotes
order by variante_id, fecha_origen, id;

select venta_id, venta_detalle_id, lote_id, codigo_lote, cantidad,
       costo_unitario, fecha_consumo
from public.venta_lote_consumos
order by fecha_consumo desc, lote_id;

select lote_id, tipo, cantidad, saldo_anterior, saldo_posterior,
       referencia_tipo, referencia_id, fecha_movimiento
from public.movimientos_lotes
order by fecha_movimiento desc;

select id, lote_id, activo, fecha_creacion
from public.qr_lotes
order by fecha_creacion desc;
