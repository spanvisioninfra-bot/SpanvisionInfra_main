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

'<i>During a fire, steel temperature rises until its strength becomes insufficient. The section factor A<sub>m</sub>/V and protection properties determine the heating rate; the utilization μ<sub>0</sub> and reduction factor k<sub>y,θ</sub> determine the critical condition.</i>

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

benutting = ?', utilization μ_0 at normal temperature'

# 2. Protection

@select bekleed "Bekleed"
  Onbekleed = 0
  Bekleed = 1
@end

@select beklvorm "Protection shape"
  Box protection = 1
  Contour protection = 2
@end

@select beklmateriaal "Protection material"
  Gypsum board = 1
  Vermiculite/perlite board = 2
  Spray mortar = 3
  Mineral wool = 4
@end

d_p = ?*(mm)', protection thickness d_p'
lambda_p = ?', warmtegeleiding bekleding λ_p [W/mK]'
rho_p = ?', volumieke massa bekleding ρ_p [kg/m³]'
c_p = ?', protection specific heat c_p [J/kgK]'

'<h6>Input summary</h6>
eis_min', brandwerendheidseis [min]'
benutting
d_p
lambda_p
rho_p
c_p

# 3. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and the parametric drawing only. The section factor A<sub>m</sub>/V, incremental steel temperature under §4.2.5.2 (unprotected) or §4.2.5.3 (protected), critical temperature θ<sub>a,cr</sub> from μ<sub>0</sub>, and comparison with the requirement are planned.</i>
`;
