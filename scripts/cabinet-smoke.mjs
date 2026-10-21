import postgres from "postgres";

const url =
  process.env.DATABASE_URL ??
  "postgresql://seotool:seotool@127.0.0.1:5432/seotool";
const sql = postgres(url, { max: 1 });

const [client] = await sql`
  INSERT INTO cabinet_clients (name, sector)
  VALUES ('Smoke Test Co', 'SaaS')
  RETURNING id, name
`;
const [site] = await sql`
  INSERT INTO cabinet_sites (client_id, name, url, environment)
  VALUES (${client.id}, 'Prod', 'https://example.com', 'production')
  RETURNING id, url
`;
const [run] = await sql`
  INSERT INTO audit_runs (site_id, source, status)
  VALUES (${site.id}, 'seomator', 'pending')
  RETURNING id, status
`;

console.log(JSON.stringify({ client, site, run }, null, 2));
await sql.end();
