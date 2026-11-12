import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson"
import rawMunicipalities from "../../Data/municipios-cundinamarca.json"

export type MunicipalityProperties = {
  name: string
  code: string
  department: string
}

export type MunicipalityFeature = Feature<
  Polygon | MultiPolygon,
  MunicipalityProperties
>

export const municipalities = rawMunicipalities as FeatureCollection<
  Polygon | MultiPolygon,
  MunicipalityProperties
>
