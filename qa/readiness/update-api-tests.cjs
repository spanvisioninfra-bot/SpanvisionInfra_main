const fs = require('fs');
function edit(path, pairs) {
  let s = fs.readFileSync(path,'utf8');
  for(const [a,b] of pairs) s=s.split(a).join(b);
  fs.writeFileSync(path,s);
}
const path='vision-bim-validator/server/tests/test_validate_endpoint.py';
let s=fs.readFileSync(path,'utf8');
const insert=s.indexOf('\nclass TestValidateEndpoint');
s=s.slice(0,insert)+`\ndef completed_result(client, response):\n    """Verify async acceptance and retrieve the real completed job response."""\n    assert response.status_code == 202, response.text\n    job_id = response.json()['job_id']\n    status = client.get('/api/v1/jobs/' + job_id)\n    assert status.status_code == 200, status.text\n    job = status.json()\n    assert job['status'] == 'completed', job\n    return job['result']\n\n`+s.slice(insert);
s=s.replaceAll('response.status_code == 200','response.status_code == 202')
   .replaceAll('response.status_code in [200, 422]', 'response.status_code in [202, 422]')
   .replaceAll('data = response.json()', 'data = completed_result(client, response)');
// The helper's GET status is 200; it separately checks POST acceptance (202).
fs.writeFileSync(path,s);
const asyncPath='vision-bim-validator/test/test_async_validation.py';
let async=fs.readFileSync(asyncPath,'utf8');
const from=async.indexOf('    def test_stuck_pending_job_is_cleaned_up_after_ttl');
const to=async.indexOf('\n    def ',from+10);
if(from>=0 && to>=0) async=async.slice(0,from)+async.slice(from,to).replace('seconds=3601','seconds=14401')+async.slice(to);
fs.writeFileSync(asyncPath,async);
edit('spanvision-geptechniek-workspace/apps/desktop/src/components/panels/MapAddressSearch.test.tsx', [['Adres of coordinaat zoeken','Search address or coordinates'], ['getByTitle("Wissen")','getByTitle("Clear")']]);
