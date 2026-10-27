-- Recreate the production keepalive schedule in development.
select cron.schedule(
  'project_keepalive',
  '17 3 */3 * *',
  'select now();'
);
