-- El backend administrativo necesita consultar perfiles para resolver
-- internamente un nombre de usuario a su identidad de Supabase Auth.
--
-- La Secret Key opera mediante service_role. RLS y los privilegios SQL son
-- capas distintas, por lo que se concede únicamente la lectura necesaria.
grant select on table public.perfiles to service_role;
