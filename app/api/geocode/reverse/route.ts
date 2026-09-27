import { NextRequest, NextResponse } from 'next/server';
import { findNearestComuna, findRegionForComuna, REGIONES_CHILE } from '@/lib/chile-locations';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');

    if (!latStr || !lngStr) {
      return NextResponse.json(
        { error: 'Faltan parámetros lat o lng' },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Coordenadas geográficas inválidas o fuera de rango (-90..90, -180..180)' },
        { status: 400 }
      );
    }

    // 1. Calcular de inmediato la comuna y región chilena más cercana como fallback
    const nearest = findNearestComuna(lat, lng);
    let detectedComuna = nearest.comuna;
    let detectedRegion = nearest.region;
    let detectedDireccion = '';

    // 2. Intentar Reverse Geocoding con Google Maps Geocoding API si hay API key
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (googleApiKey) {
      try {
        const googleRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=es&region=cl`
        );
        if (googleRes.ok) {
          const googleData = await googleRes.json();
          if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
            const first = googleData.results[0];
            detectedDireccion = first.formatted_address || '';

            // Extraer componentes (calle, número, comuna, región)
            let route = '';
            let streetNumber = '';
            let sublocality = '';
            let locality = '';
            let adminArea1 = '';

            for (const comp of first.address_components) {
              if (comp.types.includes('route')) route = comp.long_name;
              if (comp.types.includes('street_number')) streetNumber = comp.long_name;
              if (comp.types.includes('sublocality') || comp.types.includes('locality')) {
                locality = comp.long_name;
              }
              if (comp.types.includes('administrative_area_level_3')) {
                sublocality = comp.long_name;
              }
              if (comp.types.includes('administrative_area_level_1')) {
                adminArea1 = comp.long_name;
              }
            }

            if (route) {
              detectedDireccion = streetNumber ? `${route} ${streetNumber}` : route;
            }

            const candidateComuna = sublocality || locality;
            if (candidateComuna) {
              // Validar contra nuestro catálogo de comunas chilenas
              for (const reg of REGIONES_CHILE) {
                const found = reg.comunas.find(
                  (c) =>
                    c.toLowerCase() === candidateComuna.toLowerCase() ||
                    candidateComuna.toLowerCase().includes(c.toLowerCase()) ||
                    c.toLowerCase().includes(candidateComuna.toLowerCase())
                );
                if (found) {
                  detectedComuna = found;
                  detectedRegion = reg.nombre;
                  break;
                }
              }
            }

            return NextResponse.json({
              success: true,
              source: 'google',
              direccion: detectedDireccion,
              comuna: detectedComuna,
              region: detectedRegion,
              lat,
              lng,
            });
          }
        }
      } catch (gErr) {
        console.warn('Google Reverse Geocoding falló, intentando fallback...', gErr);
      }
    }

    // 3. Reverse Geocoding con OpenStreetMap Nominatim (preciso y sin costo)
    try {
      const osmRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'ObraTrack-Chile-Construction-Platform/1.0 (benja105.achavar@gmail.com)',
            'Accept-Language': 'es',
          },
        }
      );

      if (osmRes.ok) {
        const osmData = await osmRes.json();
        const addr = osmData.address || {};

        const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.path || '';
        const houseNumber = addr.house_number || '';
        if (road) {
          detectedDireccion = houseNumber ? `${road} ${houseNumber}` : road;
        } else if (osmData.display_name) {
          // Extraer la primera parte de la dirección
          const parts = osmData.display_name.split(',');
          detectedDireccion = parts.slice(0, 2).join(',').trim();
        }

        // Detectar comuna de Chile
        const candidateComuna =
          addr.suburb ||
          addr.city_district ||
          addr.county ||
          addr.municipality ||
          addr.town ||
          addr.city ||
          '';

        if (candidateComuna) {
          for (const reg of REGIONES_CHILE) {
            const found = reg.comunas.find(
              (c) =>
                c.toLowerCase() === candidateComuna.toLowerCase() ||
                candidateComuna.toLowerCase().includes(c.toLowerCase()) ||
                c.toLowerCase().includes(candidateComuna.toLowerCase())
            );
            if (found) {
              detectedComuna = found;
              detectedRegion = reg.nombre;
              break;
            }
          }
        }

        if (addr.state) {
          for (const reg of REGIONES_CHILE) {
            if (
              reg.nombre.toLowerCase().includes(addr.state.toLowerCase()) ||
              addr.state.toLowerCase().includes(reg.nombre.toLowerCase())
            ) {
              detectedRegion = reg.nombre;
              break;
            }
          }
        }
      }
    } catch (osmErr) {
      console.warn('OSM Reverse Geocoding falló, usando proximidad Haversine', osmErr);
    }

    return NextResponse.json({
      success: true,
      source: detectedDireccion ? 'reverse_geocoding' : 'haversine_nearest',
      direccion: detectedDireccion || `Obra en coordenadas (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      comuna: detectedComuna,
      region: detectedRegion,
      lat,
      lng,
    });
  } catch (error: any) {
    console.error('Error in /api/geocode/reverse:', error);
    return NextResponse.json(
      { error: error?.message || 'Error en reverse geocoding' },
      { status: 500 }
    );
  }
}
