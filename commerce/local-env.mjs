// Development entry points load this file; production uses hosting environment variables.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

export const localEnvFile=fileURLToPath(new URL('.env',import.meta.url));

export function readLocalEnvironment({file=localEnvFile,environment=process.env}={}){
  let content;
  try{content=readFileSync(file,'utf8');}
  catch(error){if(error.code==='ENOENT')return {...environment};throw new Error('Local account settings could not be read.',{cause:error});}
  // Explicit terminal/hosting variables take priority. Never mutate the browser build environment.
  return {...parseEnv(content),...environment};
}
