import { BaseRepository } from './BaseRepository.js';
import { applyNameSearch } from './applyNameSearch.js';

export class RegionRepository extends BaseRepository {
  tableName = 'regions';
  orderColumns = { NAME: 'COALESCE(name_ru, name_local)', POPULATION: 'population' };

  applyFilters(qb, filter) {
    if (filter.countryId != null) qb.where('country_id', filter.countryId);
    if (filter.search) applyNameSearch(qb, filter.search);
    if (filter.populationMin != null) qb.where('population', '>=', filter.populationMin);
    return qb;
  }
}
