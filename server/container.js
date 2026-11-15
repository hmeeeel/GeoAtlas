import { CountryRepository } from './repositories/CountryRepository.js';
import { RegionRepository } from './repositories/RegionRepository.js';
import { PlaceRepository } from './repositories/PlaceRepository.js';
import { StatsRepository } from './repositories/StatsRepository.js';
import { BoundaryRepository, SourceRepository, CollectionRunRepository } from './repositories/SupportRepositories.js';
import { PlaceService } from './services/PlaceService.js';
import { createLoaders } from './loaders.js';

export function createContainer(db) {
  const repos = {
    countries: new CountryRepository(db),
    regions: new RegionRepository(db),
    places: new PlaceRepository(db),
    stats: new StatsRepository(db),
    boundaries: new BoundaryRepository(db),
    sources: new SourceRepository(db),
    runs: new CollectionRunRepository(db),
  };
  const services = { places: new PlaceService(repos) };
  return { repos, services, createContext: () => ({ repos, services, loaders: createLoaders(repos) }) };
}
