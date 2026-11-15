import { badInput, notFound } from '../errors.js';
import { toId } from '../validation.js';

const OPTIONAL_TEXT = { nameRu: 200, nameEn: 200, timezone: 64 };

export class PlaceService {
  constructor({ places, countries, regions }) {
    this.places = places;
    this.countries = countries;
    this.regions = regions;
  }

  async create(input) {
    const countryId = toId(input.countryId, 'countryId');
    const data = this.#validateFields(input, { requireName: true });
    if (!(await this.countries.findById(countryId))) throw badInput('Страна не найдена', 'countryId');
    const regionId = input.regionId != null ? toId(input.regionId, 'regionId') : null;
    await this.#checkRegion(regionId, countryId);
    return this.places.create({ ...data, country_id: countryId, region_id: regionId, type: input.type });
  }

  async update(id, input) {
    const placeId = toId(id);
    const place = await this.places.findById(placeId);
    if (!place) throw notFound('Населённый пункт не найден');

    const data = this.#validateFields(input, { requireName: false });
    if (input.type != null) data.type = input.type;
    if ('regionId' in input) {
      const regionId = input.regionId != null ? toId(input.regionId, 'regionId') : null;
      await this.#checkRegion(regionId, place.countryId);
      data.region_id = regionId;
    }
    if (Object.keys(data).length === 0) return place;
    return this.places.update(placeId, data);
  }

  async delete(id) {
    const placeId = toId(id);
    if (!(await this.places.softDelete(placeId))) throw notFound('Населённый пункт не найден');
    return { id: String(placeId), deleted: true };
  }

  /** Проверяет только переданные поля и возвращает их в виде колонок БД. */
  #validateFields(input, { requireName }) {
    const data = {};
    if (requireName || input.nameLocal !== undefined) {
      const name = (input.nameLocal ?? '').trim();
      if (!name) throw badInput('Название не может быть пустым', 'nameLocal');
      if (name.length > 200) throw badInput('Название не длиннее 200 символов', 'nameLocal');
      data.name_local = name;
    }
    for (const [key, max] of Object.entries(OPTIONAL_TEXT)) {
      if (input[key] === undefined) continue;
      const text = input[key]?.trim() || null;
      if (text && text.length > max) throw badInput(`Не длиннее ${max} символов`, key);
      data[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = text;
    }
    if (input.population !== undefined) {
      if (input.population !== null && (!Number.isInteger(input.population) || input.population < 0)) {
        throw badInput('Население должно быть целым числом не меньше 0', 'population');
      }
      data.population = input.population;
      data.population_source = input.population === null ? null : 'manual';
    }
    if (input.lat !== undefined) {
      if (input.lat === null || input.lat < -90 || input.lat > 90) throw badInput('Широта должна быть от -90 до 90', 'lat');
      data.lat = input.lat;
    }
    if (input.lon !== undefined) {
      if (input.lon === null || input.lon < -180 || input.lon > 180) throw badInput('Долгота должна быть от -180 до 180', 'lon');
      data.lon = input.lon;
    }
    return data;
  }

  async #checkRegion(regionId, countryId) {
    if (regionId == null) return;
    const region = await this.regions.findById(regionId);
    if (!region || region.countryId !== countryId) throw badInput('Регион не принадлежит выбранной стране', 'regionId');
  }
}
