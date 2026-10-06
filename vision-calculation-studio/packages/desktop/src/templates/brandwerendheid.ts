/**
 * Brandwerendheid staal — invoerblad bij BrandwerendheidDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, doorsnede met bekleding en de twee vaste
 * referentiekrommen (ISO 834-brandkromme en de reductiefactor k_y,θ uit
 * EN 1993-1-2 tabel 3.1). De staaltemperatuurberekening (§4.2.5, incrementeel)
 * en de sterktetoets zijn nog niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met BrandwerendheidDesigner.tsx.
 */

export const brandwerendheid = `"Fire resistance — steel section (EN 1993-1-2)

'<i>Bij brand loopt de staaltemperatuur op tot de sterkte onvoldoende wordt.
'Hoe snel dat gaat volgt uit de profielfactor A<sub>m</sub>/V en de
'eigenschappen van de bekleding; wanneer het kritiek wordt volgt uit de
'benuttingsgraad μ<sub>0</sub> via de reductiefactor k<sub>y,θ</sub>.</i>

# 1. Section

@select profiel "Steel section"
  HEA 100 = 1
  HEA 120 = 2
  HEA 140 = 3
  HEA 160 = 4
  HEA 180 = 5
  HEA 200 = 6
  HEA 220 = 7
  HEA 240 = 8
  HEA 260 = 9
  HEA 300 = 10
  HEB 160 = 14
  HEB 200 = 16
  HEB 240 = 18
  HEB 300 = 20
  IPE 200 = 21
  IPE 240 = 22
  IPE 270 = 23
  IPE 300 = 24
  IPE 360 = 26
  IPE 400 = 27
@end

@select eis_min "Fire resistance requirement"
  30 minutes = 30
  60 minutes = 60
  90 minutes = 90
  120 minutes = 120
@end

@select verhitting "Heating"
  Vierzijdig = 4
  Three sides (floor above) = 3
@end

@select schema "Model"
  Statically determinate = 1
  Statically indeterminate = 2
@end

benutting = ?', benuttingsgraad μ_0 bij normale temperatuur'

# 2. Protection

@select bekleed "Bekleed"
  Onbekleed = 0
  Bekleed = 1
@end

@select beklvorm "Vorm van de bekleding"
  Box protection = 1
  Contour protection = 2
@end

@select beklmateriaal "Material van de bekleding"
  Gypsum board = 1
  Vermiculite/perlite board = 2
  Spray mortar = 3
  Mineral wool = 4
@end

d_p = ?*(mm)', dikte van de bekleding d_p'
lambda_p = ?', warmtegeleiding bekleding λ_p [W/mK]'
rho_p = ?', volumieke massa bekleding ρ_p [kg/m³]'
c_p = ?', soortelijke warmte bekleding c_p [J/kgK]'

'<h6>Overzicht van de invoer</h6>
eis_min', brandwerendheidseis [min]'
benutting
d_p
lambda_p
rho_p
c_p

# 3. Toetsing

'<i><b>Nog niet uitgewerkt.</b> Dit blad legt voorlopig alleen de invoer en het
'parametrische beeld vast. De profielfactor A<sub>m</sub>/V, de incrementele
'staaltemperatuur van §4.2.5.2 (onbekleed) resp. §4.2.5.3 (bekleed), de
'kritieke staaltemperatuur θ<sub>a,cr</sub> uit μ<sub>0</sub> en de vergelijking
'met de eis volgen.</i>
`;
