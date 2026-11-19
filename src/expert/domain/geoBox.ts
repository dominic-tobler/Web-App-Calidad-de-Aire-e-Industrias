// Recuadro geográfico que el usuario arrastra sobre el mapa.
export type GeoBox = { south: number; west: number; north: number; east: number }

export function insideBox(box: GeoBox, latitude: number, longitude: number): boolean {
  return latitude >= box.south && latitude <= box.north && longitude >= box.west && longitude <= box.east
}
