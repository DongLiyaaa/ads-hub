CREATE TABLE report_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('search-share', 'placement', 'purchased-product')),
  source_name text NOT NULL,
  source_sha256 char(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL CHECK (row_count >= 0),
  min_date date,
  max_date date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_type, source_sha256)
);

CREATE TABLE search_term_share_rows (
  dataset_id uuid NOT NULL REFERENCES report_datasets(id) ON DELETE RESTRICT,
  source_row integer NOT NULL,
  report_date date NOT NULL,
  search_term text NOT NULL,
  impression_rank numeric,
  impression_share numeric,
  targeting text,
  match_type text,
  portfolio text,
  campaign text,
  ad_group text,
  currency text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  spend numeric,
  cpc numeric,
  orders bigint,
  sales numeric,
  acos numeric,
  roas numeric,
  cvr numeric,
  PRIMARY KEY (dataset_id, source_row)
);

CREATE TABLE placement_rows (
  dataset_id uuid NOT NULL REFERENCES report_datasets(id) ON DELETE RESTRICT,
  source_row integer NOT NULL,
  report_date date NOT NULL,
  portfolio text NOT NULL,
  campaign text NOT NULL,
  bidding_strategy text,
  placement text NOT NULL,
  currency text,
  impressions bigint NOT NULL,
  clicks bigint NOT NULL,
  spend numeric NOT NULL,
  sales numeric NOT NULL,
  orders bigint NOT NULL,
  units bigint NOT NULL,
  PRIMARY KEY (dataset_id, source_row)
);

CREATE TABLE purchased_product_rows (
  dataset_id uuid NOT NULL REFERENCES report_datasets(id) ON DELETE RESTRICT,
  source_row integer NOT NULL,
  report_date date NOT NULL,
  portfolio text,
  campaign text NOT NULL,
  ad_group text,
  advertised_sku text,
  advertised_asin text NOT NULL,
  targeting text,
  match_type text,
  purchased_asin text NOT NULL,
  currency text,
  units bigint NOT NULL,
  orders bigint NOT NULL,
  sales numeric NOT NULL,
  PRIMARY KEY (dataset_id, source_row)
);

CREATE TABLE ai_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('search-share', 'placement', 'purchased-product')),
  dataset_id uuid NOT NULL REFERENCES report_datasets(id) ON DELETE RESTRICT,
  range_start date NOT NULL,
  range_end date NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload_sha256 char(64) NOT NULL,
  input_payload jsonb NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  analysis text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  UNIQUE (scope_key, version),
  CHECK (range_end >= range_start)
);

CREATE UNIQUE INDEX ai_analysis_runs_current_scope
  ON ai_analysis_runs (scope_key)
  WHERE is_current;

CREATE INDEX ai_analysis_runs_history
  ON ai_analysis_runs (scope_key, version DESC);

CREATE INDEX report_datasets_latest
  ON report_datasets (report_type, imported_at DESC);
