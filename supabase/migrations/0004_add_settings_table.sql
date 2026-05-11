create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

insert into settings (key, value) values ('kill_switch', 'false');
