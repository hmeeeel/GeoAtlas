import { BaseRepository } from './BaseRepository.js';
import { applyNameSearch } from './applyNameSearch.js';

export class CountryRepository extends BaseRepository {
  tableName = 'countries';
  orderColumns = { NAME: 'COALESCE(name_ru, name_local)', POPULATION: 'population' };

  applyFilters(qb, filter) {
    if (filter.search) applyNameSearch(qb, filter.search);
    if (filter.populationMin != null) qb.where('population', '>=', filter.populationMin);
    return qb;
  }
}
