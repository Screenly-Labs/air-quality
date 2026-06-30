export interface Coordinates {
  lat: string | number
  lng: string | number
}

export const trimCoordinates = (location: Coordinates): { lat: string; lng: string } => {
  const { lat, lng } = location
  return {
    lat: parseFloat(String(lat)).toFixed(2),
    lng: parseFloat(String(lng)).toFixed(2)
  }
}
