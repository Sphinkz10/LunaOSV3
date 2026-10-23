-- ============================================================================
-- C-16 Progresso (Figma 93:396): a evolução do 1RM estimado por exercício
-- ----------------------------------------------------------------------------
-- Por sessão, o melhor 1RM estimado (Epley: carga × (1 + reps / 30)) de cada
-- exercício da própria pessoa, nos últimos _dias dias.
-- ============================================================================
create or replace function public.my_1rm_series(_dias int default 56)
returns table (exercicio text, dia date, rm numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(e.name, se.name, 'Exercício'), (s.started_at at time zone 'Europe/Lisbon')::date,
         round(max(ss.load_kg * (1 + coalesce(ss.reps, 1) / 30.0)), 1)
  from public.session_sets ss
  join public.sessions s on s.id = ss.session_id
  join public.session_exercises se on se.id = ss.session_exercise_id
  left join public.exercises e on e.id = se.exercise_id
  where s.person_id = public.my_person_id() and ss.load_kg is not null and ss.completed
    and s.started_at >= now() - make_interval(days => greatest(_dias, 1))
  group by 1, 2
  order by 1, 2;
$$;
revoke all on function public.my_1rm_series(int) from public, anon;
grant execute on function public.my_1rm_series(int) to authenticated;
