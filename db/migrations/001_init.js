// Модель данных из ТЗ, раздел 5.

export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  await knex.schema.createTable('countries', (t) => {
    t.increments('id');
    t.string('iso2', 2).notNullable().unique();
    t.string('iso3', 3);
    t.text('name_local').notNullable();
    t.text('name_ru');
    t.text('name_en');
    t.text('capital_name');
    t.integer('population');
    t.double('area_km2');
    t.double('lat');
    t.double('lon');
    t.string('wikidata_id', 20).unique();
    t.bigInteger('osm_relation_id').unique();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('regions', (t) => {
    t.increments('id');
    t.integer('country_id').notNullable().references('id').inTable('countries').onDelete('CASCADE');
    t.text('name_local').notNullable();
    t.text('name_ru');
    t.text('name_en');
    t.string('iso_3166_2', 10);
    t.integer('admin_level');
    t.integer('population');
    t.double('lat');
    t.double('lon');
    t.string('wikidata_id', 20);
    t.bigInteger('osm_relation_id');
    t.timestamps(true, true);
    t.unique(['country_id', 'osm_relation_id']);
    // Ключ для идемпотентной записи из Wikidata (у региона всегда есть QID)
    t.unique(['country_id', 'wikidata_id']);
  });

  await knex.schema.createTable('places', (t) => {
    t.increments('id');
    t.integer('country_id').notNullable().references('id').inTable('countries').onDelete('CASCADE');
    t.integer('region_id').references('id').inTable('regions').onDelete('SET NULL');
    t.string('type', 10).notNullable();
    t.text('name_local').notNullable();
    t.text('name_ru');
    t.text('name_en');
    t.integer('population');
    t.string('population_source', 20);
    t.double('lat').notNullable();
    t.double('lon').notNullable();
    t.string('timezone', 64);
    t.string('wikidata_id', 20);
    t.bigInteger('osm_id');
    t.string('origin', 10).notNullable().defaultTo('collected');
    t.boolean('is_user_modified').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.string('otm_status', 12);
    t.timestamp('enriched_at', { useTz: true });
    t.timestamps(true, true);
  });

  await knex.schema.createTable('boundaries', (t) => {
    t.string('entity_type', 10).notNullable();
    t.integer('entity_id').notNullable();
    t.jsonb('geojson').notNullable();
    t.boolean('is_simplified').notNullable().defaultTo(true);
    t.string('source', 20);
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['entity_type', 'entity_id']);
  });

  await knex.schema.createTable('source_records', (t) => {
    t.increments('id');
    t.string('source', 20).notNullable();
    t.text('external_id').notNullable();
    t.string('entity_type', 10).notNullable();
    t.integer('entity_id').notNullable();
    t.timestamp('fetched_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['source', 'external_id', 'entity_type']);
  });

  await knex.schema.createTable('collection_runs', (t) => {
    t.increments('id');
    t.string('source', 20).notNullable();
    t.text('scope');
    t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('finished_at', { useTz: true });
    t.string('status', 10).notNullable().defaultTo('running');
    t.integer('inserted').notNullable().defaultTo(0);
    t.integer('updated').notNullable().defaultTo(0);
    t.integer('skipped').notNullable().defaultTo(0);
    t.integer('failed').notNullable().defaultTo(0);
    t.text('error_text');
  });

  // ---- Ограничения целостности ----
  await knex.raw(`
    ALTER TABLE countries ADD CONSTRAINT countries_lat_chk CHECK (lat BETWEEN -90 AND 90);
    ALTER TABLE countries ADD CONSTRAINT countries_lon_chk CHECK (lon BETWEEN -180 AND 180);
    ALTER TABLE countries ADD CONSTRAINT countries_pop_chk CHECK (population >= 0);
    ALTER TABLE regions ADD CONSTRAINT regions_lat_chk CHECK (lat BETWEEN -90 AND 90);
    ALTER TABLE regions ADD CONSTRAINT regions_lon_chk CHECK (lon BETWEEN -180 AND 180);
    ALTER TABLE regions ADD CONSTRAINT regions_pop_chk CHECK (population >= 0);
    ALTER TABLE places ADD CONSTRAINT places_lat_chk CHECK (lat BETWEEN -90 AND 90);
    ALTER TABLE places ADD CONSTRAINT places_lon_chk CHECK (lon BETWEEN -180 AND 180);
    ALTER TABLE places ADD CONSTRAINT places_pop_chk CHECK (population >= 0);
    ALTER TABLE places ADD CONSTRAINT places_type_chk CHECK (type IN ('CITY','TOWN','VILLAGE'));
    ALTER TABLE places ADD CONSTRAINT places_origin_chk CHECK (origin IN ('collected','manual'));
    ALTER TABLE places ADD CONSTRAINT places_otm_chk CHECK (otm_status IS NULL OR otm_status IN ('ok','not_found','error'));
    ALTER TABLE boundaries ADD CONSTRAINT boundaries_type_chk CHECK (entity_type IN ('country','region'));
    ALTER TABLE source_records ADD CONSTRAINT source_records_source_chk CHECK (source IN ('osm','wikidata','opentripmap'));
    ALTER TABLE source_records ADD CONSTRAINT source_records_type_chk CHECK (entity_type IN ('country','region','place'));
    ALTER TABLE collection_runs ADD CONSTRAINT collection_runs_status_chk CHECK (status IN ('running','success','partial','failed'));
  `);

  // ---- Индексы ----
  await knex.raw(`
    CREATE UNIQUE INDEX places_wikidata_id_uq ON places (wikidata_id) WHERE wikidata_id IS NOT NULL;
    CREATE UNIQUE INDEX places_osm_id_uq ON places (osm_id) WHERE osm_id IS NOT NULL;
    CREATE INDEX places_country_id_idx ON places (country_id);
    CREATE INDEX places_region_id_idx ON places (region_id);
    CREATE INDEX places_type_idx ON places (type);
    CREATE INDEX places_population_idx ON places (population DESC NULLS LAST, id);
    CREATE INDEX places_name_local_trgm ON places USING gin (name_local gin_trgm_ops);
    CREATE INDEX places_name_ru_trgm ON places USING gin (name_ru gin_trgm_ops);
    CREATE INDEX places_name_en_trgm ON places USING gin (name_en gin_trgm_ops);
    CREATE INDEX regions_country_id_idx ON regions (country_id);
    CREATE INDEX countries_name_ru_trgm ON countries USING gin (name_ru gin_trgm_ops);
    CREATE INDEX source_records_entity_idx ON source_records (entity_type, entity_id);
  `);
}

export async function down(knex) {
  for (const table of ['collection_runs', 'source_records', 'boundaries', 'places', 'regions', 'countries']) {
    await knex.schema.dropTableIfExists(table);
  }
}
