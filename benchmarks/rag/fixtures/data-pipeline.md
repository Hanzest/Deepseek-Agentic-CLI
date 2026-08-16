# Data Pipeline

## Ingestion

Raw events land in the staging bucket. A scheduler triggers batch ingestion
every 15 minutes with schema validation.

## Transformation

Spark jobs normalize timestamps, deduplicate keys, and join dimension tables.
Output is written as Parquet partitions.

## Serving

The warehouse serves analytical queries through a materialized view layer.
Slow aggregations are pre-computed nightly.
