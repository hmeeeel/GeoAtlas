import { gql } from '@apollo/client';

export const PLACE_ROW = gql`
  fragment PlaceRow on Place {
    id nameLocal nameRu nameEn type population lat lon timezone
    region { id }
    country { id }
  }
`;

export const COUNTRIES = gql`
  query Countries($filter: CountryFilter, $orderBy: CountryOrder, $pagination: PaginationInput) {
    countries(filter: $filter, orderBy: $orderBy, pagination: $pagination) {
      totalCount
      nodes { id iso2 nameRu nameLocal nameEn capitalName population regionsCount placesCount }
    }
  }
`;

export const COUNTRY_REGIONS = gql`
  query CountryRegions($id: ID!, $filter: RegionFilter, $orderBy: RegionOrder, $pagination: PaginationInput) {
    country(id: $id) {
      id nameRu nameLocal regionsCount
      regions(filter: $filter, orderBy: $orderBy, pagination: $pagination) {
        totalCount
        nodes { id nameRu nameLocal nameEn iso31662 population placesCount }
      }
    }
  }
`;

export const COUNTRY_HEADER = gql`
  query CountryHeader($id: ID!) {
    country(id: $id) { id nameRu nameLocal regionsCount }
  }
`;

export const PLACES = gql`
  query Places($filter: PlaceFilter, $search: String, $orderBy: PlaceOrder, $pagination: PaginationInput) {
    places(filter: $filter, search: $search, orderBy: $orderBy, pagination: $pagination) {
      totalCount
      nodes { ...PlaceRow }
    }
  }
  ${PLACE_ROW}
`;

export const REGION_PLACES = gql`
  query RegionPlaces($id: ID!, $filter: PlaceFilter, $orderBy: PlaceOrder, $pagination: PaginationInput) {
    region(id: $id) {
      id nameRu nameLocal
      country { id nameRu nameLocal }
      places(filter: $filter, orderBy: $orderBy, pagination: $pagination) {
        totalCount
        nodes { ...PlaceRow }
      }
    }
  }
  ${PLACE_ROW}
`;

export const PLACE = gql`
  query Place($id: ID!) {
    place(id: $id) {
      id nameLocal nameRu nameEn type population populationSource lat lon timezone origin isUserModified createdAt updatedAt
      country { id nameRu nameLocal }
      region { id nameRu nameLocal }
      sources { source externalId fetchedAt }
    }
  }
`;

export const COUNTRY_OPTIONS = gql`
  query CountryOptions {
    countries(orderBy: { field: NAME }, pagination: { limit: 100 }) { nodes { id nameRu nameLocal } }
  }
`;

export const REGION_OPTIONS = gql`
  query RegionOptions($countryId: ID!) {
    regions(filter: { countryId: $countryId }, orderBy: { field: NAME }, pagination: { limit: 100 }) { nodes { id nameRu nameLocal } }
  }
`;

export const COUNTRY_STATS = gql`
  query CountryStats($orderBy: StatOrder, $pagination: PaginationInput) {
    countryStats(orderBy: $orderBy, pagination: $pagination) {
      totalCount
      nodes { id name placesCount citiesCount townsCount villagesCount totalPopulation }
    }
  }
`;

export const REGION_STATS = gql`
  query RegionStats($countryId: ID!, $orderBy: StatOrder, $pagination: PaginationInput) {
    regionStats(countryId: $countryId, orderBy: $orderBy, pagination: $pagination) {
      totalCount
      nodes { id name placesCount citiesCount townsCount villagesCount totalPopulation }
    }
  }
`;

export const CREATE_PLACE = gql`mutation CreatePlace($input: CreatePlaceInput!) { createPlace(input: $input) { id } }`;
export const UPDATE_PLACE = gql`mutation UpdatePlace($id: ID!, $input: UpdatePlaceInput!) { updatePlace(id: $id, input: $input) { id } }`;
export const DELETE_PLACE = gql`mutation DeletePlace($id: ID!) { deletePlace(id: $id) { id deleted } }`;
