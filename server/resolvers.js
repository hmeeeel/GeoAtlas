import { GraphQLJSON, GraphQLDateTime } from 'graphql-scalars';
import { normalizeListArgs, toId, validatePagination } from './validation.js';

export const resolvers = {
  JSON: GraphQLJSON,
  DateTime: GraphQLDateTime,

  Query: {
    countries: (_, args, { repos }) => repos.countries.findPage(normalizeListArgs(args)),
    country: (_, { id }, { loaders }) => loaders.countryById.load(toId(id)),
    regions: (_, args, { repos }) => repos.regions.findPage(normalizeListArgs(args)),
    region: (_, { id }, { loaders }) => loaders.regionById.load(toId(id)),
    places: (_, args, { repos }) => repos.places.findPage(normalizeListArgs(args)),
    place: (_, { id }, { repos }) => repos.places.findById(toId(id)),
    countryStats: (_, args, { repos }) => repos.stats.countryStats({ orderBy: args.orderBy, pagination: validatePagination(args.pagination) }),
    regionStats: (_, args, { repos }) =>
      repos.stats.regionStats({ countryId: toId(args.countryId, 'countryId'), orderBy: args.orderBy, pagination: validatePagination(args.pagination) }),
    collectionRuns: (_, { limit }, { repos }) => repos.runs.latest(validatePagination({ limit }).limit),
  },

  Mutation: {
    createPlace: (_, { input }, { services }) => services.places.create(input),
    updatePlace: (_, { id, input }, { services }) => services.places.update(id, input),
    deletePlace: (_, { id }, { services }) => services.places.delete(id),
  },

  Country: {
    boundary: (country, _, { loaders }) => loaders.countryBoundary.load(country.id),
    regionsCount: (country, _, { loaders }) => loaders.regionsCountByCountry.load(country.id),
    placesCount: (country, _, { loaders }) => loaders.placesCountByCountry.load(country.id),
    regions: (country, args, { loaders }) => loaders.regionsByCountry.load({ parentId: country.id, ...normalizeListArgs(args) }),
  },

  Region: {
    country: (region, _, { loaders }) => loaders.countryById.load(region.countryId),
    boundary: (region, _, { loaders }) => loaders.regionBoundary.load(region.id),
    placesCount: (region, _, { loaders }) => loaders.placesCountByRegion.load(region.id),
    places: (region, args, { loaders }) => loaders.placesByRegion.load({ parentId: region.id, ...normalizeListArgs(args) }),
  },

  Place: {
    country: (place, _, { loaders }) => loaders.countryById.load(place.countryId),
    region: (place, _, { loaders }) => (place.regionId ? loaders.regionById.load(place.regionId) : null),
    sources: (place, _, { loaders }) => loaders.sourcesByPlace.load(place.id),
  },
};
