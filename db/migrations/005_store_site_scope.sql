ALTER TABLE stores DROP CONSTRAINT stores_tenant_id_code_key;

CREATE UNIQUE INDEX stores_tenant_id_code_site_key
  ON stores (tenant_id, code, lower(site));
