/** Read-only project sheet. Shared inputs are owned by project settings. */
export const projectMetadata = `"Project details
'<p>Set these values in Project details. They apply to every calculation sheet.</p>
'<table style="width:100%; border-collapse:collapse;">
'<tr><td>Project number</td><td>'project_nummer'</td></tr>
'<tr><td>Project name</td><td>'project_naam'</td></tr>
'<tr><td>Client</td><td>'opdrachtgever'</td></tr>
'<tr><td>Engineer</td><td>'constructeur'</td></tr>
'<tr><td>Location</td><td>'locatie'</td></tr>
'<tr><td>Consequence class</td><td>'CC'</td></tr>
'<tr><td>Reliability class</td><td>'RC'</td></tr>
'<tr><td>Design working life (years)</td><td>'DesignLife'</td></tr>
'<tr><td>Consequence factor K_FI</td><td>'K_FI'</td></tr>
'</table>
'<p>The existing engineering templates use the referenced Eurocodes and Dutch national annexes. Indian, US and UK compliance is not implemented in this edition.</p>
`;
